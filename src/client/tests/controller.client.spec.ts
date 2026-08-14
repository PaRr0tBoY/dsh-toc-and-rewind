// @vitest-environment jsdom
/**
 * TOC Tail object layer: the pure projection functions (summary extraction,
 * user-entry extraction, active-row selection) and the per-session
 * TocController (lazy snapshot subscription, view publication, resync,
 * dispose).
 */
import { describe, expect, it, vi } from 'vitest'
import type {
  ChatConversationViewNode, ConversationSnapshot, ObservableSnapshot, SessionId, UserMessageNode,
} from '@deepseek-ai/dsh-client-runtime/client'
import {
  activeUserKey, deriveTocState, extractUserEntries, summarize, tickWidthFor, TocController,
} from '../controller.ts'

const sid = (k: string): SessionId => k as SessionId

/** One finalized user message node. */
function userMessage(seq: number, text: string): UserMessageNode {
  return { kind: 'user', seq, time: seq * 1000, content: [{ type: 'text', text }], source: {} }
}

/** One chat view node for a user message. */
function userNode(seq: number, text: string, visibility: 'visible' | 'hidden' = 'visible'): ChatConversationViewNode {
  return {
    key: `user:${seq}`,
    kind: 'user',
    id: String(seq),
    target: 'chat',
    data: userMessage(seq, text),
    anchorSeq: seq,
    location: { turn: 1, step: 1, status: 'closed', data: { get: () => undefined } },
    visibility,
  } as unknown as ChatConversationViewNode
}

/** One assistant view node, used to prove extraction filters non-user kinds. */
function assistantNode(seq: number): ChatConversationViewNode {
  return {
    key: `assistant:${seq}`,
    kind: 'assistant',
    id: String(seq),
    target: 'chat',
    data: { seq, kind: 'assistant', time: seq * 1000, blocks: [] },
    anchorSeq: seq,
    location: { turn: 1, step: 1, status: 'closed', data: { get: () => undefined } },
    visibility: 'visible',
  } as unknown as ChatConversationViewNode
}

/** Minimal ConversationSnapshot over a fixed node set. */
function makeSnapshot(nodes: readonly ChatConversationViewNode[]): ConversationSnapshot {
  return {
    sessionId: sid('s1'),
    views: { get: () => undefined },
    chat: {
      order: nodes.map(node => node.key),
      nodes: {
        get: (key: string) => nodes.find(node => node.key === key),
        values: () => nodes,
      },
      locations: { getTurn: () => [], getStep: () => [] },
      timeline: { turnOrder: [], turns: new Map() },
      legacy: { nodes: [], turnTimings: new Map(), turnEnds: new Map(), partial: null, runningCalls: [] },
    },
    nodes: [],
    turnTimings: new Map(),
    turnEnds: new Map(),
    partial: null,
    runningCalls: [],
    pending: [],
    queue: [],
    running: false,
    subagent: null,
    composerPhase: 'active',
    removed: false,
    openState: 'open',
    openError: null,
    hasMore: false,
    loadingOlder: false,
    promptError: null,
    blank: false,
    lastAgentError: null,
  } as unknown as ConversationSnapshot
}

/** Observable snapshot double with a mutable current snapshot. */
function fakeSession(initial: ConversationSnapshot): ObservableSnapshot<ConversationSnapshot> & {
  set(next: ConversationSnapshot): void
  listenerCount(): number
} {
  let current = initial
  const listeners = new Set<() => void>()
  return {
    getSnapshot: () => current,
    subscribe: listener => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    set(next) {
      current = next
      for (const listener of listeners) listener()
    },
    listenerCount: () => listeners.size,
  }
}

describe('summarize', () => {
  it('joins text blocks into one line and collapses whitespace', () => {
    const node: UserMessageNode = {
      kind: 'user', seq: 1, time: 1,
      content: [
        { type: 'text', text: '  hello\n  world  ' },
        { type: 'text', text: ' again' },
      ],
      source: {},
    }
    expect(summarize(node)).toBe('hello world again')
  })

  it('truncates at the length cap with an ellipsis', () => {
    const node = userMessage(1, 'a'.repeat(100))
    expect(summarize(node, 20)).toBe('a'.repeat(20) + '…')
  })

  it('keeps text at or under the cap intact', () => {
    expect(summarize(userMessage(1, 'short'), 20)).toBe('short')
    expect(summarize(userMessage(1, 'exactly twenty chars'), 20)).toBe('exactly twenty chars')
  })

  it('returns an empty string for a message without text', () => {
    const node = {
      kind: 'user', seq: 1, time: 1,
      content: [{ type: 'image' }],
      source: {},
    } as unknown as UserMessageNode
    expect(summarize(node)).toBe('')
  })
})

describe('extractUserEntries', () => {
  it('keeps only visible user nodes, in event-seq order', () => {
    const snapshot = makeSnapshot([
      assistantNode(1),
      userNode(3, 'third'),
      userNode(1, 'first'),
      userNode(2, 'second'),
    ])
    const entries = extractUserEntries(snapshot)
    expect(entries.map(entry => entry.seq)).toEqual([1, 2, 3])
    expect(entries.map(entry => entry.key)).toEqual(['user:1', 'user:2', 'user:3'])
    expect(entries[0]?.summary).toBe('first')
    expect(entries[1]?.time).toBe(2000)
  })

  it('drops hidden user nodes', () => {
    const snapshot = makeSnapshot([userNode(1, 'visible'), userNode(2, 'hidden', 'hidden')])
    expect(extractUserEntries(snapshot).map(entry => entry.seq)).toEqual([1])
  })

  it('returns an empty list for a snapshot without user messages', () => {
    expect(extractUserEntries(makeSnapshot([]))).toEqual([])
  })

  it('drops user entries shadowed by a rewind fold', () => {
    const marker = {
      key: 'rewind:9',
      kind: 'toc-rewind',
      id: '9',
      target: 'chat',
      data: { kind: 'toc-rewind', seq: 9, time: 9000, text: 'marker', shadowedSeqs: [2, 3] },
      anchorSeq: 9,
      location: { turn: 2, step: 1, status: 'closed', data: { get: () => undefined } },
      visibility: 'visible',
    } as unknown as ChatConversationViewNode
    const snapshot = makeSnapshot([userNode(1, 'first'), userNode(2, 'second'), userNode(3, 'third'), marker])
    expect(extractUserEntries(snapshot).map(entry => entry.seq)).toEqual([1])
  })
})

describe('deriveTocState', () => {
  it('maps chat keys to anchor seqs and collects shadowed seqs from markers', () => {
    const marker = {
      key: 'rewind:9',
      kind: 'toc-rewind',
      id: '9',
      target: 'chat',
      data: { kind: 'toc-rewind', seq: 9, time: 9000, text: 'marker', shadowedSeqs: [2, 3] },
      anchorSeq: 9,
      location: { turn: 2, step: 1, status: 'closed', data: { get: () => undefined } },
      visibility: 'visible',
    } as unknown as ChatConversationViewNode
    const state = deriveTocState(makeSnapshot([userNode(1, 'a'), marker]))
    expect(state.nodesByKey.get('user:1')).toBe(1)
    expect(state.nodesByKey.get('rewind:9')).toBe(9)
    expect([...state.shadowedSeqs]).toEqual([2, 3])
  })
})

describe('activeUserKey', () => {
  const band = { top: 0, bottom: 600 }
  const row = (key: string, isUser: boolean, top: number, bottom: number) => ({ key, isUser, top, bottom })

  it('keeps the user prompt active while its assistant answer is in view', () => {
    // The prompt scrolled past the top; the answer owns the band.
    const rows = [
      row('user:1', true, -50, -10),
      row('assistant:1', false, 100, 400),
      row('user:2', true, 500, 550),
    ]
    expect(activeUserKey(rows, band.top, band.bottom)).toBe('user:1')
  })

  it('highlights the prompt itself when it is the first visible row', () => {
    const rows = [
      row('user:1', true, 20, 70),
      row('assistant:1', false, 80, 300),
    ]
    expect(activeUserKey(rows, band.top, band.bottom)).toBe('user:1')
  })

  it('switches when the next user prompt scrolls into view', () => {
    // The whole first paragraph is above the band; the second prompt is visible.
    const rows = [
      row('user:1', true, -200, -100),
      row('assistant:1', false, -90, -5),
      row('user:2', true, 20, 80),
    ]
    expect(activeUserKey(rows, band.top, band.bottom)).toBe('user:2')
  })

  it('prefers the first (topmost) prompt when two prompts are visible', () => {
    const rows = [
      row('user:1', true, 10, 60),
      row('user:2', true, 200, 250),
    ]
    expect(activeUserKey(rows, band.top, band.bottom)).toBe('user:1')
  })

  it('counts a partially visible answer as in the band', () => {
    const rows = [
      row('user:1', true, -100, -20),
      row('assistant:1', false, -30, 50), // top peeking in
    ]
    expect(activeUserKey(rows, band.top, band.bottom)).toBe('user:1')
  })

  it('returns null when no row intersects the band', () => {
    const rows = [
      row('user:1', true, -50, -10),
      row('assistant:1', false, 700, 800),
    ]
    expect(activeUserKey(rows, band.top, band.bottom)).toBeNull()
  })

  it('returns null for an empty row set', () => {
    expect(activeUserKey([], band.top, band.bottom)).toBeNull()
  })
})

describe('tickWidthFor', () => {
  it('maps zero length to the narrowest tick', () => {
    expect(tickWidthFor(0, 100)).toBe(16)
  })

  it('scales proportionally to the longest message', () => {
    expect(tickWidthFor(50, 100)).toBe(32) // half of the longest → mid-point
    expect(tickWidthFor(100, 100)).toBe(48) // the longest → widest
    expect(tickWidthFor(200, 100)).toBe(48) // clamps at the longest
  })

  it('handles an all-empty message set without dividing by zero', () => {
    expect(tickWidthFor(0, 0)).toBe(16)
  })
})

describe('TocController', () => {
  it('publishes a ready view with entries on first subscribe', () => {
    const session = fakeSession(makeSnapshot([userNode(1, 'one'), userNode(2, 'two')]))
    const controller = new TocController(session)
    const listener = vi.fn()
    controller.subscribe(listener)
    expect(controller.getSnapshot().status).toBe('ready')
    expect(controller.getSnapshot().entries.map(entry => entry.summary)).toEqual(['one', 'two'])
    expect(listener).toHaveBeenCalledTimes(1)
    controller.dispose()
  })

  it('republishes when the snapshot gains a user message', () => {
    const session = fakeSession(makeSnapshot([userNode(1, 'one')]))
    const controller = new TocController(session)
    const listener = vi.fn()
    controller.subscribe(listener)
    session.set(makeSnapshot([userNode(1, 'one'), userNode(2, 'two')]))
    expect(controller.getSnapshot().entries.map(entry => entry.seq)).toEqual([1, 2])
    expect(listener).toHaveBeenCalledTimes(2)
    controller.dispose()
  })

  it('stops listening to the session when the last subscriber leaves', () => {
    const session = fakeSession(makeSnapshot([userNode(1, 'one')]))
    const controller = new TocController(session)
    const unsubscribe = controller.subscribe(() => {})
    expect(session.listenerCount()).toBe(1)
    unsubscribe()
    expect(session.listenerCount()).toBe(0)
    expect(controller.getSnapshot().status).toBe('ready')
    controller.dispose()
  })

  it('resync re-reads the authoritative snapshot', () => {
    const session = fakeSession(makeSnapshot([userNode(1, 'one')]))
    const controller = new TocController(session)
    controller.subscribe(() => {})
    session.set(makeSnapshot([userNode(1, 'one'), userNode(2, 'two')]))
    // No subscriber notification is needed: resync reads the current snapshot.
    expect(controller.getSnapshot().entries.map(entry => entry.seq)).toEqual([1, 2])
    controller.resync()
    expect(controller.getSnapshot().entries.map(entry => entry.seq)).toEqual([1, 2])
    controller.dispose()
  })

  it('dispose drops listeners, stops the snapshot subscription, and silences later resyncs', () => {
    const session = fakeSession(makeSnapshot([userNode(1, 'one')]))
    const controller = new TocController(session)
    const listener = vi.fn()
    controller.subscribe(listener)
    controller.dispose()
    listener.mockClear()
    session.set(makeSnapshot([userNode(2, 'two')]))
    expect(listener).not.toHaveBeenCalled()
    expect(session.listenerCount()).toBe(0)
    controller.resync()
    expect(controller.getSnapshot().entries.map(entry => entry.seq)).toEqual([1])
  })
})
