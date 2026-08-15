/**
 * dsh-toc-tail host half: the rewind engine behind the directory panel.
 * Every `user/message` event snapshots the session workspace (code restore
 * source); the `/toc-rewind` slash command folds the conversation surface
 * from a chosen user-request node onward — plain fold, LLM summary, and/or
 * code restore per the client's confirm menu. The browser half ships via
 * exports["./client"] and triggers this command through `session.command`.
 *
 * @module dsh-toc-tail
 */
import type { Context } from '@deepseek-ai/cordis';
export { RewindError } from './rewind/region.ts';
export type { RewindOptions, RewindResult } from './rewind/fold.ts';
export type { TocRewindEvent } from './rewind/types.ts';
/** Host plugin identity (matches cordis.patch.yml and the client bundle). */
export declare const name = "dsh-toc-tail";
/** The rewind command needs the host command registry. */
export declare const inject: string[];
/**
 * Install the host half: workspace snapshots on every user message, then the
 * `/toc-rewind` command.
 * @param ctx - the host cordis context.
 */
export declare function apply(ctx: Context): void;
//# sourceMappingURL=index.d.ts.map