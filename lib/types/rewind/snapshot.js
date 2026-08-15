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
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
/** Directories never snapshotted (transient, huge, or tool-owned). */
const IGNORED_DIRS = new Set(['node_modules', '.git', '.dsh', 'dist', 'lib', '.reasonix']);
/** Only text files under this size (bytes) enter a snapshot. */
const MAX_FILE_BYTES = 1 << 20; // 1 MiB
/** Whether a path is one of the ignored workspace directories. */
function isIgnored(relativePath) {
    return relativePath.split(sep).some(part => IGNORED_DIRS.has(part));
}
/** Walk a workspace tree, returning relative path → utf8 content. */
async function collectWorkspace(cwd) {
    const files = {};
    const pending = [cwd];
    while (pending.length > 0) {
        const dir = pending.pop();
        let entries;
        try {
            entries = await readdir(dir, { withFileTypes: true });
        }
        catch {
            continue; // unreadable directory: skip, never fail the capture
        }
        for (const entry of entries) {
            const abs = join(dir, entry.name);
            const rel = relative(cwd, abs);
            if (isIgnored(rel))
                continue;
            if (entry.isDirectory()) {
                pending.push(abs);
            }
            else if (entry.isFile()) {
                try {
                    const info = await stat(abs);
                    if (info.size > MAX_FILE_BYTES)
                        continue;
                    files[rel.split(sep).join('/')] = await readFile(abs, 'utf8');
                }
                catch {
                    // Unreadable file: skip, never fail the capture.
                }
            }
        }
    }
    return files;
}
/**
 * Snapshot store for one plugin context. `capture` is fire-and-forget from
 * the session/event hook; `restore` is awaited from the rewind command.
 */
export class SnapshotStore {
    /** Root directory holding one folder per session. */
    root;
    /**
     * Create the store.
     * @param baseDir - host data directory (`ctx.baseDir`).
     */
    constructor(baseDir) {
        this.root = join(baseDir, 'toc-tail', 'snapshots');
    }
    dirFor(sessionId) {
        // SessionIds may contain path-hostile characters; keep one flat folder.
        return join(this.root, encodeURIComponent(sessionId));
    }
    /**
     * Capture the session workspace as of a user/message seq. Resolves with
     * the captured count; never rejects (a failed capture is logged by the
     * caller through the returned rejection on I/O errors inside collect).
     * @param session - the session whose workspace to capture.
     * @param seq - the triggering event seq (also the snapshot key).
     * @param cwd - the workspace root (defaults to the session header cwd).
     * @returns the capture result.
     */
    async capture(session, seq, cwd) {
        const workspace = cwd ?? session.header.cwd;
        if (workspace === undefined) {
            return { seq, fileCount: 0 };
        }
        const dir = this.dirFor(session.id);
        await mkdir(dir, { recursive: true });
        const payload = { files: await collectWorkspace(resolve(workspace)) };
        await writeFile(join(dir, `${seq}.json`), JSON.stringify(payload), 'utf8');
        return { seq, fileCount: Object.keys(payload.files).length };
    }
    /**
     * Restore the newest snapshot at or before `targetSeq` into the workspace.
     * @param session - the session being rewound.
     * @param targetSeq - the rewind target user-request seq.
     * @param cwd - the workspace root (defaults to the session header cwd).
     * @returns the restore result; a missing snapshot resolves with `null`
     * snapshotSeq and zero restored files.
     */
    async restore(session, targetSeq, cwd) {
        const workspace = cwd ?? session.header.cwd;
        if (workspace === undefined) {
            return { snapshotSeq: -1, restoredCount: 0 };
        }
        const dir = this.dirFor(session.id);
        let names;
        try {
            names = await readdir(dir);
        }
        catch {
            return { snapshotSeq: -1, restoredCount: 0 };
        }
        const candidates = names
            .filter(name => name.endsWith('.json'))
            .map(name => Number.parseInt(name.slice(0, -'.json'.length), 10))
            .filter(seq => Number.isSafeInteger(seq) && seq <= targetSeq)
            .sort((a, b) => b - a);
        if (candidates.length === 0) {
            return { snapshotSeq: -1, restoredCount: 0 };
        }
        const snapshotSeq = candidates[0];
        const payload = JSON.parse(await readFile(join(dir, `${snapshotSeq}.json`), 'utf8'));
        let restoredCount = 0;
        const root = resolve(workspace);
        for (const [rel, content] of Object.entries(payload.files)) {
            const target = resolve(root, ...rel.split('/'));
            if (!target.startsWith(root + sep) && target !== root)
                continue; // path traversal guard
            await mkdir(join(target, '..'), { recursive: true });
            await writeFile(target, content, 'utf8');
            restoredCount += 1;
        }
        return { snapshotSeq, restoredCount };
    }
}
