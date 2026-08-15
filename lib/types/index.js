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
import { registerRewindCommand } from "./rewind/command.js";
import { SnapshotStore } from "./rewind/snapshot.js";
export { RewindError } from "./rewind/region.js";
/** Host plugin identity (matches cordis.patch.yml and the client bundle). */
export const name = 'dsh-toc-tail';
/** The rewind command needs the host command registry. */
export const inject = ['commands'];
/**
 * Install the host half: workspace snapshots on every user message, then the
 * `/toc-rewind` command.
 * @param ctx - the host cordis context.
 */
export function apply(ctx) {
    // Snapshots live under the dsh data home (never the launch cwd, which may
    // be a user workspace); fall back to cwd only when DSH_HOME is unset.
    const snapshots = new SnapshotStore(process.env.DSH_HOME ?? process.cwd());
    ctx.on('session/event', (session, event) => {
        if (event.type !== 'user/message')
            return;
        void snapshots.capture(session, event.seq).catch(error => {
            ctx.logger.warn('toc-tail snapshot failed: %s', error instanceof Error ? error.message : String(error));
        });
    });
    registerRewindCommand(ctx, snapshots);
}
