/**
 * The `/toc-rewind` slash command: rewinds the conversation to a user-request
 * node by folding everything after it (surface replace), optionally restoring
 * the code state at that node and/or keeping an LLM summary of the folded
 * span as the new context. The directory panel's confirm menu submits this
 * command through the client's `session.command` channel.
 *
 * @module dsh-toc-tail/rewind/command
 */
import type { Context } from '@deepseek-ai/cordis';
import type { SnapshotStore } from './snapshot.ts';
/** Parse `<seq> [code] [summary]` into a target and option flags. */
export declare function parseRewindArgs(rawInput: string): {
    seq: number;
    options: {
        code: boolean;
        summary: boolean;
    };
};
/** Register the global `/toc-rewind` command. */
export declare function registerRewindCommand(ctx: Context, snapshots: SnapshotStore): void;
//# sourceMappingURL=command.d.ts.map