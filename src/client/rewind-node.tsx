/**
 * Rewind marker nodes: the host half's fold replacement message
 * (`user/message` with source `{ kind: 'plugin', plugin: 'toc-tail' }`) is not
 * an append-surface event, so the stock definitions never render it — this
 * Definition claims it and renders a visible summary card at the bottom of
 * the message flow, carrying the shadowed seqs the rail uses to hide the
 * folded conversation and prune its ticks.
 * @module dsh-toc-tail/client/rewind-node
 */

import { memo } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type { ChatConversationViewNode, ConversationNodeDefinition } from '@deepseek-ai/dsh-client-runtime/client'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import css from './TocTail.module.css'

/** Stable plugin identity of the fold replacement message. */
export const REWIND_SOURCE_PLUGIN = 'toc-tail'

/** One settled rewind, rendered as a marker card at the flow bottom. */
export interface RewindMarkerNode {
  readonly kind: 'toc-rewind'
  /** Seq of the replacement user/message event. */
  readonly seq: number
  /** Unix epoch ms from the source session event. */
  readonly time: number
  /** Marker or LLM summary text that replaced the folded span. */
  readonly text: string
  /** Surface seqs shadowed by this fold (the folded conversation). */
  readonly shadowedSeqs: readonly number[]
}

declare module '@deepseek-ai/dsh-client-ui-conversation/client' {
  interface ChatNodeDataMap {
    /** Rewind fold marker card (plugin-owned, rendered at the flow bottom). */
    'toc-rewind': RewindMarkerNode
  }
}

/** Join the text blocks of the replacement message. */
function extractText(content: readonly { type: string }[]): string {
  let text = ''
  for (const block of content) {
    if (block.type === 'text' && typeof (block as { text?: unknown }).text === 'string') {
      text += (block as unknown as { text: string }).text
    }
  }
  return text
}

/**
 * Recover the shadowed surface seqs from the replacement's provenance: the
 * `sourceEventSeqs` array lists the `toc/rewind` record seq (the largest —
 * appended last) followed by every shadowed surface node.
 */
export function extractShadowedSeqs(sourceEventSeqs: unknown): readonly number[] {
  if (!Array.isArray(sourceEventSeqs)) return []
  const seqs = sourceEventSeqs.filter((seq): seq is number =>
    typeof seq === 'number' && Number.isSafeInteger(seq) && seq >= 0)
  if (seqs.length === 0) return []
  const recordSeq = Math.max(...seqs)
  return seqs.filter(seq => seq < recordSeq)
}

/** Claim the plugin's fold replacement message and read its payload. */
export const rewindMarkerDefinition: ConversationNodeDefinition<RewindMarkerNode> = {
  kind: 'toc-rewind',
  target: 'chat',
  match: (event): { id: string; role: 'start' } | null => {
    if (event.type !== 'user/message') return null
    const source = event.data.source
    if (source?.kind !== 'plugin' || source.plugin !== REWIND_SOURCE_PLUGIN) return null
    return { id: String(event.seq), role: 'start' }
  },
  start: (_context, match): RewindMarkerNode => {
    const event = match.event as SessionEvent<'user/message'>
    return {
      kind: 'toc-rewind',
      seq: event.seq,
      time: event.time,
      text: extractText(event.data.content),
      shadowedSeqs: extractShadowedSeqs(
        (event as SessionEvent & { sourceEventSeqs?: unknown }).sourceEventSeqs,
      ),
    }
  },
  update: context => context.state,
  buildViewNode: (context): ChatConversationViewNode | null => {
    if (context.state === undefined) return null
    const location = context.matches[0]?.location
    if (location === undefined) return null
    return {
      key: context.key,
      kind: 'toc-rewind',
      id: context.id,
      target: 'chat',
      anchorSeq: context.state.seq,
      location,
      visibility: 'visible',
      data: context.state,
    }
  },
}

/** Keyed chat renderer for the rewind marker card. */
export const RewindMarkerNodeView = memo(function RewindMarkerNodeView({
  node, t,
}: PropsRuntime<'conversation.chat.node', 'toc-rewind'> & PropsLocale<'toc-tail'>) {
  const data = node.data as RewindMarkerNode
  return (
    <div className={css.rewindMarker}>
      <p className={css.rewindMarkerText}>{data.text}</p>
      <span className={css.rewindMarkerMeta}>
        {t('rewind.folded', { n: data.shadowedSeqs.length })}
      </span>
    </div>
  )
})

/** Register the definition and its renderer on the owning context. */
export function registerRewindMarker(ctx: Context): void {
  ctx.conversationEvents.register(rewindMarkerDefinition)
  ctx.slots.inject('conversation.chat.node', () => ctx.slots.register(
    { name: 'conversation.chat.node', key: 'toc-rewind', locale: 'toc-tail' },
    RewindMarkerNodeView,
  ))
}
