// @vitest-environment jsdom
/**
 * TOC Tail rail on a fake shell: rendering per user request, hiding when no
 * conversation scrollport (or a too-narrow column) is present, click
 * navigation through the scrollport, hover/focus preview panel with Escape
 * dismissal, and unsubscribe-on-unmount.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type {
  ChatConversationViewNode, ConversationSnapshot, ObservableSnapshot, SessionId,
} from '@deepseek-ai/dsh-client-runtime/client'
import { TocController } from '../controller.ts'
import { TocTail } from '../TocTail.tsx'
import type { TocTailInjected } from '../TocTail.tsx'
import { zh } from '../locales.ts'

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

const sid = (k: string): SessionId => k as SessionId

function userNode(seq: number, text: string): ChatConversationViewNode {
  return {
    key: `user:${seq}`,
    kind: 'user',
    id: String(seq),
    target: 'chat',
    data: { kind: 'user', seq, time: seq * 1000, content: [{ type: 'text', text }], source: {} },
    anchorSeq: seq,
    location: { turn: 1, step: 1, status: 'closed', data: { get: () => undefined } },
    visibility: 'visible',
  } as unknown as ChatConversationViewNode
}

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

/** Fake session observable over a mutable snapshot. */
function fakeSession(initial: ConversationSnapshot) {
  let current = initial
  const listeners = new Set<() => void>()
  return {
    face: {
      getSnapshot: () => current,
      subscribe: (listener: () => void) => {
        listeners.add(listener)
        return () => { listeners.delete(listener) }
      },
    } as ObservableSnapshot<ConversationSnapshot>,
    set(next: ConversationSnapshot) {
      current = next
      for (const listener of listeners) listener()
    },
  }
}

/** Insert the conversation scrollport DOM with the given flow rows into document.body. */
function mountScrollport(
  rows: { key: string; kind?: string; top: number; bottom: number }[],
  width = 800,
): HTMLElement {
  const scrollport = document.createElement('div')
  scrollport.dataset.conversationScroll = ''
  const flow = document.createElement('div')
  flow.dataset.chatFlow = ''
  for (const row of rows) {
    const element = document.createElement('div')
    element.dataset.chatAnchorKey = row.key
    element.dataset.chatFlowKind = row.kind ?? 'user'
    Object.defineProperty(element, 'getBoundingClientRect', {
      value: () => rect(row.top, row.bottom, 200),
      configurable: true,
    })
    flow.appendChild(element)
  }
  scrollport.appendChild(flow)
  Object.defineProperty(scrollport, 'getBoundingClientRect', {
    value: () => rect(0, 600, width),
    configurable: true,
  })
  document.body.appendChild(scrollport)
  return scrollport
}

function rect(top: number, bottom: number, width: number) {
  return {
    top, bottom, left: 0, right: width, x: 0, y: 0, width, height: bottom - top,
    toJSON: () => ({}),
  }
}

/** Minimal translate over the zh dictionary. */
function translate(key: string, params?: Record<string, unknown>): string {
  let text: string = zh[key as keyof typeof zh] ?? key
  for (const [name, value] of Object.entries(params ?? {})) {
    text = text.replaceAll(`{${name}}`, String(value))
  }
  return text
}

/** Boot the rail over a fake session and current selection. */
function mount(options: {
  nodes?: ChatConversationViewNode[]
  current?: SessionId
  width?: number
  rows?: { key: string; kind?: string; top: number; bottom: number }[]
} = {}) {
  const session = fakeSession(makeSnapshot(options.nodes ?? [
    userNode(1, 'first'), userNode(2, 'second'), userNode(3, 'third'),
  ]))
  const controller = new TocController(session.face)
  const controllerFor = vi.fn<TocTailInjected['controllerFor']>((id: SessionId) => {
    if (id !== sid('s1')) return null
    return controller
  })
  const current = 'current' in options ? options.current : sid('s1')
  const listState = {
    ids: [], byId: {}, current, phase: 'ready' as const, subagentsByParent: {}, jobsBySession: {},
  }
  const useSessions = ((selector: (state: typeof listState) => unknown) => selector(listState)) as never
  const useWorkspaces = (() => undefined) as never
  const scrollport = mountScrollport(options.rows ?? [], options.width)
  const scrollTo = vi.fn()
  Object.defineProperty(scrollport, 'scrollTo', { value: scrollTo, configurable: true })
  const rewind = vi.fn<TocTailInjected['rewind']>().mockResolvedValue(undefined)
  const view = render(<TocTail controllerFor={controllerFor} rewind={rewind} useSessions={useSessions} useWorkspaces={useWorkspaces} t={translate} />)
  return { ...view, session, controller, controllerFor, rewind, scrollport, scrollTo }
}

describe('TocTail', () => {
  beforeEach(() => {
    // jsdom has no layout engine; the component guards its usage.
    class ResizeObserverStub {
      observe(): void {}
      disconnect(): void {}
      unobserve(): void {}
    }
    vi.stubGlobal('ResizeObserver', ResizeObserverStub)
  })

  it('renders one tick per user request', async () => {
    const { container } = mount()
    await waitFor(() => {
      expect(container.querySelector('[role="navigation"]')).not.toBeNull()
    })
    expect(container.querySelectorAll('button[type="button"]')).toHaveLength(3)
    expect(screen.getByRole('navigation').getAttribute('aria-label')).toBe(zh['rail.aria'])
  })

  it('stays hidden with two or fewer user requests', async () => {
    const { container } = mount({
      nodes: [userNode(1, 'first'), userNode(2, 'second')],
    })
    await new Promise(resolve => setTimeout(resolve, 30))
    expect(container.querySelector('[role="navigation"]')).toBeNull()
  })

  it('renders nothing without a conversation scrollport', async () => {
    const session = fakeSession(makeSnapshot([userNode(1, 'first')]))
    const controller = new TocController(session.face)
    const controllerFor = () => controller
    const listState = { ids: [], byId: {}, current: sid('s1'), phase: 'ready' as const, subagentsByParent: {}, jobsBySession: {} }
    const useSessions = ((selector: (state: typeof listState) => unknown) => selector(listState)) as never
    const useWorkspaces = (() => undefined) as never
    const { container } = render(<TocTail controllerFor={controllerFor} rewind={() => Promise.resolve()} useSessions={useSessions} useWorkspaces={useWorkspaces} t={translate} />)
    await new Promise(resolve => setTimeout(resolve, 30))
    expect(container.querySelector('[role="navigation"]')).toBeNull()
    controller.dispose()
  })

  it('renders nothing when the conversation column is too narrow', async () => {
    const { container } = mount({ width: 300 })
    await new Promise(resolve => setTimeout(resolve, 30))
    expect(container.querySelector('[role="navigation"]')).toBeNull()
  })

  it('renders nothing without a current session', async () => {
    const { container } = mount({ current: undefined })
    await new Promise(resolve => setTimeout(resolve, 30))
    expect(container.querySelector('[role="navigation"]')).toBeNull()
  })

  it('sizes ticks by prompt length', async () => {
    const { container } = mount({
      nodes: [userNode(1, 'short'), userNode(2, 'mid length text'), userNode(3, 'x'.repeat(320))],
    })
    await waitFor(() => {
      expect(container.querySelectorAll('button')).toHaveLength(3)
    })
    const ticks = [...container.querySelectorAll('button')]
    const shortWidth = Number.parseFloat(ticks[0]?.style.width ?? '')
    const longWidth = Number.parseFloat(ticks[2]?.style.width ?? '')
    expect(longWidth).toBeGreaterThan(shortWidth)
    expect(shortWidth).toBeGreaterThan(0)
  })

  it('navigates to the clicked request through the scrollport', async () => {
    const { container, scrollTo } = mount({
      rows: [
        { key: 'user:1', top: 100, bottom: 150 },
        { key: 'user:2', top: 300, bottom: 350 },
        { key: 'user:3', top: 500, bottom: 550 },
      ],
    })
    await waitFor(() => {
      expect(container.querySelectorAll('button')).toHaveLength(3)
    })
    const ticks = [...container.querySelectorAll('button')]
    fireEvent.click(ticks[1]!)
    expect(scrollTo).toHaveBeenCalledTimes(1)
    expect(scrollTo).toHaveBeenCalledWith({ top: 300, behavior: 'smooth' })
  })

  it('keeps a tick active while its assistant answer is in view', async () => {
    // user:1 scrolled past the top; the answer owns the band until user:2 arrives.
    const { container } = mount({
      rows: [
        { key: 'user:1', top: -50, bottom: -10 },
        { key: 'assistant:1', kind: 'assistant', top: 100, bottom: 400 },
        { key: 'user:2', top: 500, bottom: 550 },
      ],
    })
    await waitFor(() => {
      const ticks = [...container.querySelectorAll('button')]
      expect(ticks[0]?.getAttribute('aria-current')).toBe('true')
      expect(ticks[1]?.getAttribute('aria-current')).toBeNull()
    })
  })

  it('switches active when the next user prompt scrolls into view', async () => {
    const { container } = mount({
      rows: [
        { key: 'user:1', top: -200, bottom: -100 },
        { key: 'assistant:1', kind: 'assistant', top: -90, bottom: -5 },
        { key: 'user:2', top: 20, bottom: 80 },
      ],
    })
    await waitFor(() => {
      const ticks = [...container.querySelectorAll('button')]
      expect(ticks[0]?.getAttribute('aria-current')).toBeNull()
      expect(ticks[1]?.getAttribute('aria-current')).toBe('true')
    })
  })

  it('opens the shared directory panel on focus and closes it on Escape', async () => {
    const { container } = mount()
    await waitFor(() => {
      expect(container.querySelectorAll('button')).toHaveLength(3)
    })
    const ticks = [...container.querySelectorAll('button')]
    fireEvent.focus(ticks[0]!)
    await waitFor(() => {
      // The directory replaces the rail and lists every request.
      expect(container.querySelector('[role="list"]')).not.toBeNull()
      expect(container.querySelectorAll('button')).toHaveLength(3) // directory items only
      expect(container.textContent).toContain('first')
      expect(container.textContent).toContain('third')
    })
    fireEvent.keyDown(container.querySelector('[role="navigation"]')!, { key: 'Escape' })
    await waitFor(() => {
      expect(container.querySelector('[role="list"]')).toBeNull()
      expect(container.querySelectorAll('button')).toHaveLength(3) // ticks back
    })
  })

  it('shows every request in the directory on hover', async () => {
    const { container } = mount({
      nodes: [userNode(1, 'first'), userNode(2, 'second'), userNode(3, 'third')],
    })
    await waitFor(() => {
      expect(container.querySelectorAll('button')).toHaveLength(3)
    })
    fireEvent.mouseEnter([...container.querySelectorAll('button')][2]!)
    await waitFor(() => {
      expect(container.querySelector('[role="list"]')).not.toBeNull()
      expect(container.querySelectorAll('button')).toHaveLength(3) // ticks replaced
      expect(container.textContent).toContain('first')
      expect(container.textContent).toContain('second')
      expect(container.textContent).toContain('third')
    })
  })

  it('opens a confirm menu on row click and submits the rewind', async () => {
    const { container, rewind } = mount({
      rows: [
        { key: 'user:1', top: 100, bottom: 150 },
        { key: 'user:2', top: 300, bottom: 350 },
        { key: 'user:3', top: 500, bottom: 550 },
      ],
    })
    await waitFor(() => {
      expect(container.querySelectorAll('button')).toHaveLength(3)
    })
    fireEvent.focus([...container.querySelectorAll('button')][0]!)
    await waitFor(() => {
      expect(container.querySelector('[role="list"]')).not.toBeNull()
    })
    // Clicking a directory row turns it into the confirm menu.
    fireEvent.click([...container.querySelectorAll('[role="listitem"]')][1]!)
    await waitFor(() => {
      expect(container.textContent).toContain(zh['confirm.title'])
      expect(container.textContent).toContain(zh['confirm.code'])
      expect(container.textContent).toContain(zh['confirm.summary'])
    })
    // Select both post-rewind actions and confirm.
    const checkboxes = [...container.querySelectorAll('input[type="checkbox"]')]
    fireEvent.click(checkboxes[0]!)
    fireEvent.click(checkboxes[1]!)
    const ok = [...container.querySelectorAll('button')].find(button => button.textContent === zh['confirm.ok'])
    fireEvent.click(ok!)
    await waitFor(() => {
      expect(rewind).toHaveBeenCalledTimes(1)
      expect(rewind).toHaveBeenCalledWith(sid('s1'), 2, { code: true, summary: true })
    })
    // The directory closes once the rewind settled.
    await waitFor(() => {
      expect(container.querySelector('[role="list"]')).toBeNull()
    })
  })

  it('cancels the confirm menu back to the row', async () => {
    const { container, rewind } = mount()
    await waitFor(() => {
      expect(container.querySelectorAll('button')).toHaveLength(3)
    })
    fireEvent.mouseEnter([...container.querySelectorAll('button')][0]!)
    await waitFor(() => {
      expect(container.querySelector('[role="list"]')).not.toBeNull()
    })
    fireEvent.click([...container.querySelectorAll('[role="listitem"]')][0]!)
    await waitFor(() => {
      expect(container.textContent).toContain(zh['confirm.title'])
    })
    const cancel = [...container.querySelectorAll('button')].find(button => button.textContent === zh['confirm.cancel'])
    fireEvent.click(cancel!)
    await waitFor(() => {
      expect(container.textContent).not.toContain(zh['confirm.title'])
      expect(rewind).not.toHaveBeenCalled()
    })
  })

  it('closes the directory on mouse leave', async () => {
    const { container } = mount()
    await waitFor(() => {
      expect(container.querySelectorAll('button')).toHaveLength(3)
    })
    fireEvent.mouseEnter([...container.querySelectorAll('button')][0]!)
    await waitFor(() => {
      expect(container.querySelector('[role="list"]')).not.toBeNull()
    })
    fireEvent.mouseLeave(container.querySelector('[role="navigation"]')!)
    await waitFor(() => {
      expect(container.querySelector('[role="list"]')).toBeNull()
    })
  })

  it('unsubscribes from the session snapshot when it unmounts', async () => {
    const session = fakeSession(makeSnapshot([userNode(1, 'first')]))
    const controller = new TocController(session.face)
    const controllerFor = () => controller
    const listState = { ids: [], byId: {}, current: sid('s1'), phase: 'ready' as const, subagentsByParent: {}, jobsBySession: {} }
    const useSessions = ((selector: (state: typeof listState) => unknown) => selector(listState)) as never
    const useWorkspaces = (() => undefined) as never
    const scrollport = mountScrollport([{ key: 'user:1', top: 100, bottom: 150 }])
    const scrollTo = vi.fn()
    Object.defineProperty(scrollport, 'scrollTo', { value: scrollTo, configurable: true })
    const { unmount } = render(<TocTail controllerFor={controllerFor} rewind={() => Promise.resolve()} useSessions={useSessions} useWorkspaces={useWorkspaces} t={translate} />)
    await waitFor(() => {
      expect(controller.getSnapshot().status).toBe('ready')
    })
    unmount()
    expect(controller.getSnapshot().status).toBe('ready')
    controller.dispose()
  })
})
