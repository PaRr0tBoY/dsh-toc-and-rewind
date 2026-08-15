/**
 * Code snapshots: every `user/message` event captures the session workspace
 * tree, so a rewind to any user-request node can restore the code state as it
 * was when that request started. Snapshots live under
 * `<baseDir>/toc-tail/snapshots/<sessionId>/<seq>.json` as a flat relative
 * path → utf8 text map. Restore picks the newest snapshot at or before the
 * target seq and writes its files back into the workspace.
 *
 * @module dsh-toc-tail/rewind/snapshot
 */
import type { Session } from '@deepseek-ai/dsh-session';
/** One snapshot file: session workspace paths relative to the session cwd. */
export interface SnapshotPayload {
    /** Unix-separated relative paths → utf8 text content. */
    readonly files: Record<string, string>;
}
/** Result of a snapshot capture. */
export interface CaptureResult {
    /** Seq of the user/message event that triggered it. */
    readonly seq: number;
    /** Files captured. */
    readonly fileCount: number;
}
/** Result of a snapshot restore. */
export interface RestoreResult {
    /** Seq of the snapshot that was restored (newest at/before the target). */
    readonly snapshotSeq: number;
    /** Files written back. */
    readonly restoredCount: number;
}
/**
 * Snapshot store for one plugin context. `capture` is fire-and-forget from
 * the session/event hook; `restore` is awaited from the rewind command.
 */
export declare class SnapshotStore {
    /** Root directory holding one folder per session. */
    readonly root: string;
    /**
     * Create the store.
     * @param baseDir - host data directory (`ctx.baseDir`).
     */
    constructor(baseDir: string);
    private dirFor;
    /**
     * Capture the session workspace as of a user/message seq. Resolves with
     * the captured count; never rejects (a failed capture is logged by the
     * caller through the returned rejection on I/O errors inside collect).
     * @param session - the session whose workspace to capture.
     * @param seq - the triggering event seq (also the snapshot key).
     * @param cwd - the workspace root (defaults to the session header cwd).
     * @returns the capture result.
     */
    capture(session: Session, seq: number, cwd?: string): Promise<CaptureResult>;
    /**
     * Restore the newest snapshot at or before `targetSeq` into the workspace.
     * @param session - the session being rewound.
     * @param targetSeq - the rewind target user-request seq.
     * @param cwd - the workspace root (defaults to the session header cwd).
     * @returns the restore result; a missing snapshot resolves with `null`
     * snapshotSeq and zero restored files.
     */
    restore(session: Session, targetSeq: number, cwd?: string): Promise<RestoreResult>;
}
//# sourceMappingURL=snapshot.d.ts.map