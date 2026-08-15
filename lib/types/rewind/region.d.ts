/**
 * Fold-region selection over a session surface: the pure log/surface math a
 * rewind runs. The tool-pairing balance is a local reimplementation of the
 * official compaction seam's `toolPairingBalancedBefore/After` (that package
 * is not published to npm), so a fold never splits a tool-call/result pair.
 *
 * @module dsh-toc-tail/rewind/region
 */
import type { SessionEvent } from '@deepseek-ai/dsh-session';
/** Stable failure classes for a rewind fold. */
export type RewindErrorCode = 'INVALID_TARGET' | 'EMPTY_REGION' | 'UNBALANCED' | 'FOLD_IN_PROGRESS' | 'CHANGED';
/** Typed error for rewind fold rejections. */
export declare class RewindError extends Error {
    readonly code: RewindErrorCode;
    readonly name = "RewindError";
    /**
     * Create one classified fold failure.
     * @param code - stable failure class.
     * @param message - backend diagnostic retained as the Error message.
     */
    constructor(code: RewindErrorCode, message: string);
}
/** One validated inclusive span of current surface positions. */
export interface RewindRegion {
    /** Inclusive first shadowed surface-node seq. */
    readonly start: number;
    /** Inclusive last shadowed surface-node seq. */
    readonly end: number;
    /** The shadowed surface nodes, in surface order. */
    readonly shadowedSeqs: readonly number[];
}
/** The session read side a region selection needs (structural, testable). */
export interface RegionSource {
    readonly events: readonly SessionEvent[];
    readonly surface: {
        readonly nodes: readonly number[];
    };
}
/** The open turn enclosing a log position, or `null` between turns. */
export declare function openTurnOf(events: readonly SessionEvent[]): number | null;
/**
 * Balance of every surface cut: `cuts[i]` is the cut immediately before
 * surface node `i` (`cuts[0]` is the surface head, trivially balanced).
 * A cut is balanced when no unanswered tool call crosses it.
 * @param events - the session's event log.
 * @param seqs - the current surface node seqs, in surface order.
 * @returns one boolean per cut (length `seqs.length + 1`).
 */
export declare function cutBalances(events: readonly SessionEvent[], seqs: readonly number[]): readonly boolean[];
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
export declare function selectRewindRegion(source: RegionSource, targetSeq: number): RewindRegion;
//# sourceMappingURL=region.d.ts.map