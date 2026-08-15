/**
 * The rewind fold transaction: select the region, run the chosen post-rewind
 * actions (code restore, summary), then commit the surface replacement in one
 * synchronous block — a log-only `toc/rewind` provenance record plus a
 * `user/message` that shadows the folded span. Failures never leave the
 * bracket open (no fold lock needed: a failed fold rejects before the commit).
 *
 * @module dsh-toc-tail/rewind/fold
 */
import { createUserMessage } from '@deepseek-ai/dsh-llm';
import { RewindError, openTurnOf, selectRewindRegion } from "./region.js";
import { TOC_REWIND_SOURCE, summarizeRegion } from "./summarize.js";
/** The marker text replacing the folded span when no summary was requested. */
export const REWIND_MARKER_TEXT = '⏪ 已回溯到此处，以下对话已折叠。';
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
export async function executeRewind(ctx, agent, snapshots, targetSeq, options, signal) {
    const session = agent.session;
    const region = selectRewindRegion(session, targetSeq);
    let report;
    if (options.summary) {
        report = await summarizeRegion(ctx, session, region, agent, signal);
        signal?.throwIfAborted();
    }
    let restoredFiles;
    if (options.code) {
        const restore = await snapshots.restore(session, targetSeq);
        restoredFiles = restore.restoredCount;
    }
    // Synchronous commit: no await between the record and the replacement.
    const record = session.append('toc/rewind', {
        turn: openTurnOf(session.events),
        targetSeq,
        foldedRange: { start: region.start, end: region.end },
        options: { code: options.code, summary: options.summary },
        ...(report === undefined ? {} : { report }),
    });
    session.append('user/message', createUserMessage({
        content: [{ type: 'text', text: report ?? REWIND_MARKER_TEXT }],
        source: TOC_REWIND_SOURCE,
    }), {
        surfaceOp: { op: 'replace', start: region.start, end: region.end },
        sourceEventSeqs: [record.seq, ...region.shadowedSeqs],
    });
    return {
        foldedNodes: region.shadowedSeqs.length,
        start: region.start,
        end: region.end,
        ...(report === undefined ? {} : { report }),
        ...(restoredFiles === undefined ? {} : { restoredFiles }),
    };
}
/** Re-export the classified error for command handlers. */
export { RewindError };
