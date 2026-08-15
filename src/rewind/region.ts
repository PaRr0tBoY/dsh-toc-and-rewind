/**
 * Fold-region selection over a session surface: the pure log/surface math a
 * rewind runs. The tool-pairing balance is a local reimplementation of the
 * official compaction seam's `toolPairingBalancedBefore/After` (that package
 * is not published to npm), so a fold never splits a tool-call/result pair.
 *
 * @module dsh-toc-tail/rewind/region
 */

import type { SessionEvent } from '@deepseek-ai/dsh-session'

/** Stable failure classes for a rewind fold. */
export type RewindErrorCode =
  | 'INVALID_TARGET'
  | 'EMPTY_REGION'
  | 'UNBALANCED'
  | 'FOLD_IN_PROGRESS'
  | 'CHANGED'

/** Typed error for rewind fold rejections. */
export class RewindError extends Error {
  override readonly name = 'RewindError'

  /**
   * Create one classified fold failure.
   * @param code - stable failure class.
   * @param message - backend diagnostic retained as the Error message.
   */
  constructor(
    readonly code: RewindErrorCode,
    message: string,
  ) {
    super(message)
  }
}

/** One validated inclusive span of current surface positions. */
export interface RewindRegion {
  /** Inclusive first shadowed surface-node seq. */
  readonly start: number
  /** Inclusive last shadowed surface-node seq. */
  readonly end: number
  /** The shadowed surface nodes, in surface order. */
  readonly shadowedSeqs: readonly number[]
}

/** The session read side a region selection needs (structural, testable). */
export interface RegionSource {
  readonly events: readonly SessionEvent[]
  readonly surface: { readonly nodes: readonly number[] }
}

/** The open turn enclosing a log position, or `null` between turns. */
export function openTurnOf(events: readonly SessionEvent[]): number | null {
  let latest: SessionEvent<'turn/start'> | SessionEvent<'turn/end'> | undefined
  for (const event of events) {
    if (event.type === 'turn/start' || event.type === 'turn/end') latest = event
  }
  return latest?.type === 'turn/start' ? latest.data.turn : null
}

/** How one surface event changes the in-progress tool-call count. */
function eventDelta(event: SessionEvent): number {
  switch (event.type) {
    case 'assistant/message':
      return event.data.message.content.filter(block => block.type === 'tool-call').length
    case 'tool/result':
      return -1
    default:
      return 0
  }
}

/**
 * Balance of every surface cut: `cuts[i]` is the cut immediately before
 * surface node `i` (`cuts[0]` is the surface head, trivially balanced).
 * A cut is balanced when no unanswered tool call crosses it.
 * @param events - the session's event log.
 * @param seqs - the current surface node seqs, in surface order.
 * @returns one boolean per cut (length `seqs.length + 1`).
 */
export function cutBalances(
  events: readonly SessionEvent[],
  seqs: readonly number[],
): readonly boolean[] {
  const cuts: boolean[] = [true]
  let inProgressToolCalls = 0
  for (const seq of seqs) {
    const event = events[seq]
    if (event === undefined || event.seq !== seq) {
      throw new RewindError('INVALID_TARGET', `surface seq ${seq} has no matching session event (corrupt surface)`)
    }
    inProgressToolCalls += eventDelta(event)
    if (inProgressToolCalls < 0) {
      throw new RewindError('UNBALANCED', `tool/result at surface seq ${seq} has no matching tool-call (corrupt surface)`)
    }
    cuts.push(inProgressToolCalls === 0)
  }
  return cuts
}

/**
 * Select the fold region: every surface node from the target user request on
 * (the selected message itself is withdrawn — revoked back to the composer,
 * as if it was never sent), up to the surface tail. The region starts at the
 * first tool-pairing-balanced cut at or after the target so a fold never
 * splits a tool-call/result pair.
 * @param source - the session's events and surface.
 * @param targetSeq - event seq of the selected user request.
 * @returns the validated inclusive surface span.
 * @throws {@link RewindError} `INVALID_TARGET` when the seq is not a surface
 * node, `EMPTY_REGION` when nothing follows, `UNBALANCED` when no balanced
 * cut exists.
 */
export function selectRewindRegion(source: RegionSource, targetSeq: number): RewindRegion {
  if (!Number.isSafeInteger(targetSeq) || targetSeq < 0) {
    throw new RewindError('INVALID_TARGET', `rewind target must be a non-negative safe integer, got ${String(targetSeq)}`)
  }
  const seqs = source.surface.nodes
  if (!seqs.includes(targetSeq)) {
    throw new RewindError('INVALID_TARGET', `rewind target seq ${targetSeq} is not a current surface node`)
  }
  const targetEvent = source.events[targetSeq]
  if (targetEvent === undefined || targetEvent.type !== 'user/message') {
    throw new RewindError('INVALID_TARGET', `rewind target seq ${targetSeq} is not a user request`)
  }
  const cuts = cutBalances(source.events, seqs)
  // First surface node at or after the target (the target itself folds);
  // skip to the next balanced cut so the fold never starts inside an open
  // tool-call/result pair.
  let startIdx = seqs.findIndex(seq => seq >= targetSeq)
  if (startIdx === -1) {
    throw new RewindError('EMPTY_REGION', `rewind: no surface nodes at or after seq ${targetSeq}`)
  }
  while (startIdx < seqs.length && !cuts[startIdx]) startIdx += 1
  if (startIdx >= seqs.length) {
    throw new RewindError('UNBALANCED', 'rewind: no balanced fold cut at or after the target node')
  }
  const endIdx = seqs.length - 1
  return {
    start: seqs[startIdx]!,
    end: seqs[endIdx]!,
    shadowedSeqs: seqs.slice(startIdx),
  }
}
