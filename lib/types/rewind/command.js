/**
 * The `/toc-rewind` slash command: rewinds the conversation to a user-request
 * node by folding everything after it (surface replace), optionally restoring
 * the code state at that node and/or keeping an LLM summary of the folded
 * span as the new context. The directory panel's confirm menu submits this
 * command through the client's `session.command` channel.
 *
 * @module dsh-toc-tail/rewind/command
 */
import { executeRewind } from "./fold.js";
import { RewindError } from "./region.js";
const USAGE = 'Usage: /toc-rewind <seq> [code] [summary]';
/** Parse `<seq> [code] [summary]` into a target and option flags. */
export function parseRewindArgs(rawInput) {
    const parts = rawInput.trim().split(/\s+/u).filter(part => part.length > 0);
    if (parts.length < 1)
        throw new RewindError('INVALID_TARGET', USAGE);
    const seq = Number.parseInt(parts[0], 10);
    if (!Number.isSafeInteger(seq) || seq < 0) {
        throw new RewindError('INVALID_TARGET', `rewind target must be a non-negative integer, got "${parts[0]}"`);
    }
    const flags = new Set(parts.slice(1));
    for (const flag of flags) {
        if (flag !== 'code' && flag !== 'summary') {
            throw new RewindError('INVALID_TARGET', `unknown rewind option "${flag}"; ${USAGE}`);
        }
    }
    return {
        seq,
        options: { code: flags.has('code'), summary: flags.has('summary') },
    };
}
/** Register the global `/toc-rewind` command. */
export function registerRewindCommand(ctx, snapshots) {
    ctx.commands.register({
        name: 'toc-rewind',
        description: 'rewind the conversation to a user-request node (fold everything after it)',
        input: { hint: '<seq> [code] [summary]' },
        handler: async ({ agent, rawInput, signal }) => {
            let parsed;
            try {
                parsed = parseRewindArgs(rawInput);
            }
            catch (error) {
                return errorResult(error);
            }
            try {
                const result = await executeRewind(ctx, agent, snapshots, parsed.seq, parsed.options, signal);
                const lines = [
                    `Rewound to seq ${parsed.seq}: folded ${result.foldedNodes} node(s) [${result.start}..${result.end}].`,
                    ...(result.report === undefined ? [] : ['Kept an LLM summary of the folded span.']),
                    ...(result.restoredFiles === undefined ? [] : [`Restored ${result.restoredFiles} file(s) from the code snapshot.`]),
                ];
                return { kind: 'success', text: lines.join('\n') };
            }
            catch (error) {
                return errorResult(error);
            }
        },
    });
}
/** Fold any thrown error into a CommandResult failure message. */
function errorResult(error) {
    const text = `toc-rewind failed: ${error instanceof Error ? error.message : String(error)}`;
    return { kind: 'error', text };
}
