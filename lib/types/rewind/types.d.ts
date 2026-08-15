/**
 * Rewind vocabulary: the `toc/rewind` session event appended by a settled
 * fold. Log-only (no `surfaceOp`), so compaction or a later fold never
 * shadows the provenance record; the actual surface replacement is the
 * subsequent `user/message` event carrying this record's seq in its
 * `sourceEventSeqs`.
 *
 * @module dsh-toc-tail/rewind/types
 */
import type { SessionEvent } from '@deepseek-ai/dsh-session';
declare module '@deepseek-ai/dsh-session/types' {
    interface SessionEventMap {
        /**
         * One settled rewind fold: the conversation surface from the selected
         * user-request node onward was replaced by a marker or an LLM summary.
         */
        'toc/rewind': {
            /** Numbered open turn, or `null` for an idle-session fold. */
            turn: number | null;
            /** Event seq of the user request the fold targets (kept on the surface). */
            targetSeq: number;
            /** Inclusive surface range shadowed by the replacement. */
            foldedRange: {
                start: number;
                end: number;
            };
            /** The selected post-rewind actions. */
            options: {
                code: boolean;
                summary: boolean;
            };
            /** Auto-generated summary when `options.summary` was set. */
            report?: string;
        };
    }
}
/** The merged `toc/rewind` event type for consumers. */
export type TocRewindEvent = SessionEvent<'toc/rewind'>;
//# sourceMappingURL=types.d.ts.map