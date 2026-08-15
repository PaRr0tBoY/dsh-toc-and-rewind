/**
 * The rewind fold transaction: select the region, run the chosen post-rewind
 * actions (code restore, summary), then commit the surface replacement in one
 * synchronous block — a log-only `toc/rewind` provenance record plus a
 * `user/message` that shadows the folded span. Failures never leave the
 * bracket open (no fold lock needed: a failed fold rejects before the commit).
 *
 * @module dsh-toc-tail/rewind/fold
 */
import type { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
import { RewindError } from './region.ts';
import type { SnapshotStore } from './snapshot.ts';
/** Post-rewind actions the user may select in the directory confirm menu. */
export interface RewindOptions {
    /** Restore the code state at the target node (workspace snapshot). */
    readonly code: boolean;
    /** Summarize the folded span and keep the report as the new context. */
    readonly summary: boolean;
}
/** One settled fold, as reported to the command caller. */
export interface RewindResult {
    /** Number of surface nodes folded into the marker/report. */
    readonly foldedNodes: number;
    /** Inclusive first folded surface-node seq. */
    readonly start: number;
    /** Inclusive last folded surface-node seq. */
    readonly end: number;
    /** Auto-generated summary when `options.summary` was set. */
    readonly report?: string;
    /** Files restored when `options.code` was set. */
    readonly restoredFiles?: number;
}
/** The marker text replacing the folded span when no summary was requested. */
export declare const REWIND_MARKER_TEXT = "\u23EA \u5DF2\u56DE\u6EAF\u5230\u6B64\u5904\uFF0C\u4EE5\u4E0B\u5BF9\u8BDD\u5DF2\u6298\u53E0\u3002";
/**
 * Run one rewind fold against the agent's session.
 * @param ctx - context carrying the llm service (used only with `summary`).
 * @param agent - the agent whose session is folded.
 * @param snapshots - the code snapshot store (used only with `code`).
 * @param targetSeq - event seq of the selected user request.
 * @param options - the chosen post-rewind actions.
 * @param signal - optional cancellation signal forwarded to summarization.
 * @returns the settled fold result.
 * @throws {@link RewindError} for expected failures.
 */
export declare function executeRewind(ctx: Context, agent: Agent, snapshots: SnapshotStore, targetSeq: number, options: RewindOptions, signal?: AbortSignal): Promise<RewindResult>;
/** Re-export the classified error for command handlers. */
export { RewindError };
//# sourceMappingURL=fold.d.ts.map