/**
 * TOC Tail object layer: pure projection functions over one Session's
 * ConversationSnapshot plus a per-session {@link TocController} that turns the
 * snapshot subscription into an immutable {@link TocView} (one entry per user
 * message). Components never see the session face directly — they subscribe
 * to the controller's view, the same HostObservable pattern every other
 * per-session client object layer uses.
 * @module dsh-toc-tail/client/controller
 */

import type {
  ChatConversationViewNode, ConversationSnapshot, ObservableSnapshot, UserMessageNode,
} from '@deepseek-ai/dsh-client-runtime/client'
import type { ContentBlock } from '@deepseek-ai/dsh-llm/types'
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'

/** One user message compressed to a timeline tick. */
export interface TocEntry {
  /** Chat node key — the same identity stamped onto `data-chat-anchor-key`. */
  readonly key: string
  /** Source event seq (deterministic ordering key). */
  readonly seq: number
  /** Unix epoch ms from the source session event. */
  readonly time: number
  /** Summarized text of the message ('' when it carries no text). */
  readonly summary: string
  /** Raw text length in characters — the tick-width input. */
  readonly length: number
}

/** Load state of a TOC controller. */
export type TocStatus = 'cold' | 'ready'

/** Immutable view published to the rail. */
export interface TocView {
  readonly status: TocStatus
  /** User messages in conversation order. */
  readonly entries: readonly TocEntry[]
}

const EMPTY_ENTRIES: readonly TocEntry[] = []

const COLD_VIEW: TocView = Object.freeze({ status: 'cold', entries: EMPTY_ENTRIES })

/** Default summary length cap in characters. */
export const SUMMARY_MAX_LENGTH = 80

/**
 * Join one user message's text blocks into a single line summary, collapsing
 * whitespace and truncating at {@link SUMMARY_MAX_LENGTH}. Pure.
 * @param node - finalized user message node.
 * @param maxLength - optional length cap override.
 * @returns the summary; '' when the message carries no text.
 */
export function summarize(node: UserMessageNode, maxLength = SUMMARY_MAX_LENGTH): string {
  let text = ''
  for (const block of node.content) {
    if (block.type === 'text' && typeof block.text === 'string') text += block.text
  }
  const collapsed = text.replace(/\s+/g, ' ').trim()
  if (collapsed.length <= maxLength) return collapsed
  return collapsed.slice(0, maxLength) + '…'
}

/** Raw text length of one user message, un-collapsed and untruncated. */
function textLength(node: UserMessageNode): number {
  let length = 0
  for (const block of node.content) {
    if (block.type === 'text' && typeof block.text === 'string') length += block.text.length
  }
  return length
}

/** Narrowest / widest tick in px. */
export const TICK_WIDTH_RANGE = { min: 16, max: 32 } as const

/**
 * Map a prompt's text length to a tick width in px, proportional to the
 * longest prompt in the conversation: the longest message gets the widest
 * tick, every other tick scales by its length ratio. Pure — the rail computes
 * `maxLength` once per view, so a long request renders a visibly longer tick
 * and the longest request defines the scale.
 * @param length - raw text length in characters.
 * @param maxLength - the longest message's raw text length (the scale).
 * @param min - narrowest width.
 * @param max - widest width.
 * @returns width in px within [min, max].
 */
export function tickWidthFor(
  length: number,
  maxLength: number,
  min = TICK_WIDTH_RANGE.min,
  max = TICK_WIDTH_RANGE.max,
): number {
  const ratio = maxLength <= 0 ? 0 : Math.min(Math.max(length, 0), maxLength) / maxLength
  return Math.round(min + ratio * (max - min))
}

/**
 * Extract the visible user messages from one conversation snapshot, in
 * conversation (event seq) order. Entries shadowed by a rewind fold (their
 * seq listed in a `toc-rewind` marker) are dropped so the rail only indexes
 * the surviving conversation. Pure.
 * @param snapshot - live conversation snapshot.
 * @returns one {@link TocEntry} per visible user message.
 */
export function extractUserEntries(snapshot: ConversationSnapshot): TocEntry[] {
  const nodes: ChatConversationViewNode[] = []
  const shadowed = new Set<number>()
  for (const node of snapshot.chat.nodes.values()) {
    if (node.kind === 'toc-rewind') {
      const data = node.data as { readonly shadowedSeqs?: readonly number[] }
      for (const seq of data.shadowedSeqs ?? []) shadowed.add(seq)
    }
  }
  for (const node of snapshot.chat.nodes.values()) {
    if (node.kind === 'user' && node.visibility !== 'hidden') nodes.push(node)
  }
  nodes.sort((a, b) => a.anchorSeq - b.anchorSeq)
  const entries: TocEntry[] = []
  for (const node of nodes) {
    const data = node.data as UserMessageNode
    if (shadowed.has(data.seq)) continue
    entries.push({
      key: node.key,
      seq: data.seq,
      time: data.time,
      summary: summarize(data),
      length: textLength(data),
    })
  }
  return entries
}

/** Snapshot-derived state the rail needs beyond the entry list. */
export interface TocDerived {
  /** Surface seqs shadowed by every rewind fold (hidden from the flow). */
  readonly shadowedSeqs: ReadonlySet<number>
  /** Chat node key → anchor seq, the DOM-hiding bridge. */
  readonly nodesByKey: ReadonlyMap<string, number>
}

const EMPTY_DERIVED: TocDerived = Object.freeze({
  shadowedSeqs: Object.freeze(new Set<number>()),
  nodesByKey: Object.freeze(new Map<string, number>()),
})

/**
 * Project one conversation snapshot into the rail's derived state: shadowed
 * seqs (from `toc-rewind` markers) and the key→anchorSeq map. Pure.
 * @param snapshot - live conversation snapshot.
 * @returns derived state.
 */
export function deriveTocState(snapshot: ConversationSnapshot): TocDerived {
  const shadowedSeqs = new Set<number>()
  const nodesByKey = new Map<string, number>()
  for (const node of snapshot.chat.nodes.values()) {
    nodesByKey.set(node.key, node.anchorSeq)
    if (node.kind === 'toc-rewind') {
      const data = node.data as { readonly shadowedSeqs?: readonly number[] }
      for (const seq of data.shadowedSeqs ?? []) shadowedSeqs.add(seq)
    }
  }
  return Object.freeze({ shadowedSeqs, nodesByKey })
}

/** One flow row in viewport coordinates. */
export interface FlowRow {
  /** Stable chat-node key (`data-chat-anchor-key`). */
  readonly key: string
  /** True when this row is a user request (a paragraph start). */
  readonly isUser: boolean
  readonly top: number
  readonly bottom: number
}

/**
 * Paragraph-scoped active selection: the user request that owns the first row
 * visible in the viewport band. A paragraph is one user request plus every
 * following row up to the next user request, so an assistant answer keeps its
 * user prompt's tick highlighted until the next user prompt scrolls into view.
 * When two user prompts are visible, the first (topmost) one owns the band.
 * Pure — callers supply viewport coordinates from the scrollport's own rect so
 * the result is layout-independent.
 * @param rows - all flow rows in document order.
 * @param viewportTop - band top.
 * @param viewportBottom - band bottom.
 * @returns the owning user row's key, or null.
 */
export function activeUserKey(
  rows: readonly FlowRow[],
  viewportTop: number,
  viewportBottom: number,
): string | null {
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!
    if (row.bottom > viewportTop && row.top < viewportBottom) {
      // First visible row found; walk back to its paragraph's user request.
      for (let j = i; j >= 0; j--) {
        if (rows[j]!.isUser) return rows[j]!.key
      }
      return null
    }
  }
  return null
}

/**
 * Per-session TOC object layer. One instance backs the rail while the session
 * is current; it subscribes to the session's conversation snapshot lazily (on
 * the first subscriber) and stops when the last subscriber leaves.
 */
export class TocController implements HostObservable<TocView> {
  private view: TocView = COLD_VIEW
  private derived: TocDerived = EMPTY_DERIVED
  private readonly listeners = new Set<() => void>()
  private unsubscribe: (() => void) | null = null
  private disposed = false

  /**
   * @param session - the outward session face (ObservableSnapshot half).
   */
  constructor(private readonly session: ObservableSnapshot<ConversationSnapshot>) {}

  /** Return the cached immutable view. */
  getSnapshot = (): TocView => this.view

  /**
   * Return the full raw text of one user request by event seq (used to
   * prefill the composer when a rewind withdraws it), or undefined when no
   * user node carries that seq.
   * @param seq - source event seq.
   * @returns the joined text blocks, or undefined.
   */
  textOf(seq: number): string | undefined {
    const snapshot = this.session.getSnapshot()
    for (const node of snapshot.chat.nodes.values()) {
      if (node.kind !== 'user') continue
      const data = node.data as UserMessageNode
      if (data.seq !== seq) continue
      const text = data.content
        .filter((block): block is Extract<ContentBlock, { type: 'text' }> => block.type === 'text')
        .map(block => block.text)
        .join('\n')
      return text === '' ? undefined : text
    }
    return undefined
  }

  /**
   * Return the snapshot-derived rail state (shadowed seqs + key→seq map),
   * always consistent with the current view (same snapshot generation).
   */
  getDerived = (): TocDerived => this.derived

  /** Subscribe to view replacement; starts the snapshot subscription on demand. */
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    this.ensureListening()
    return () => {
      this.listeners.delete(listener)
      if (this.listeners.size === 0) this.stopListening()
    }
  }

  /**
   * Re-read the authoritative snapshot. Called on connection/reset for
   * controllers a component already subscribed to; idempotent.
   */
  resync(): void {
    if (this.disposed) return
    this.publishFrom(this.session.getSnapshot())
  }

  /** Drop subscribers, stop the snapshot subscription, and refuse further work. */
  dispose(): void {
    this.disposed = true
    this.stopListening()
    this.listeners.clear()
  }

  /** Start listening to the session snapshot and seed the first view. */
  private ensureListening(): void {
    if (this.unsubscribe !== null) return
    this.unsubscribe = this.session.subscribe(() => {
      if (this.disposed) return
      this.publishFrom(this.session.getSnapshot())
    })
    this.publishFrom(this.session.getSnapshot())
  }

  /** Stop listening when the last subscriber leaves. */
  private stopListening(): void {
    this.unsubscribe?.()
    this.unsubscribe = null
  }

  /** Replace view + derived state and contain subscriber failures. */
  private publishFrom(snapshot: ConversationSnapshot): void {
    this.derived = deriveTocState(snapshot)
    this.view = Object.freeze({ status: 'ready' as const, entries: extractUserEntries(snapshot) })
    for (const listener of this.listeners) {
      try {
        listener()
      } catch (error) {
        console.error('[dsh-toc-tail] subscriber threw:', error)
      }
    }
  }
}
