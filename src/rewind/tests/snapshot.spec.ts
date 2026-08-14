// @vitest-environment jsdom
/**
 * Workspace snapshot capture/restore against a real temp directory.
 * @module dsh-toc-tail/rewind/tests/snapshot
 */
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Session } from '@deepseek-ai/dsh-session'
import { SnapshotStore } from '../snapshot.ts'

/** Minimal session shape: only id + header.cwd are read. */
function fakeSession(id: string, cwd: string): Session {
  return { id, header: { id, version: 1, createdAt: 0, cwd } } as unknown as Session
}

let baseDir: string
let workspace: string
let store: SnapshotStore

beforeEach(async () => {
  baseDir = await mkdtemp(join(tmpdir(), 'toc-tail-snap-'))
  workspace = await mkdtemp(join(tmpdir(), 'toc-tail-ws-'))
  store = new SnapshotStore(baseDir)
})

afterEach(async () => {
  await rm(baseDir, { recursive: true, force: true })
  await rm(workspace, { recursive: true, force: true })
})

describe('SnapshotStore', () => {
  it('captures the workspace and restores the newest snapshot at/before the target', async () => {
    await writeFile(join(workspace, 'a.txt'), 'v1', 'utf8')
    const session = fakeSession('s1', workspace)
    const first = await store.capture(session, 5)
    expect(first.fileCount).toBeGreaterThan(0)

    // Mutate the workspace after the first snapshot.
    await writeFile(join(workspace, 'a.txt'), 'v2', 'utf8')
    await store.capture(session, 9)

    // Restore at a target between the two snapshots → first snapshot wins.
    const restored = await store.restore(session, 6)
    expect(restored.snapshotSeq).toBe(5)
    expect(restored.restoredCount).toBe(first.fileCount)
    expect(await readFile(join(workspace, 'a.txt'), 'utf8')).toBe('v1')
  })

  it('captures nested files and skips ignored directories', async () => {
    await mkdir(join(workspace, 'src'), { recursive: true })
    await mkdir(join(workspace, 'node_modules', 'dep'), { recursive: true })
    await writeFile(join(workspace, 'src', 'index.ts'), 'code', 'utf8')
    await writeFile(join(workspace, 'node_modules', 'dep', 'x.js'), 'junk', 'utf8')
    const session = fakeSession('s1', workspace)
    const result = await store.capture(session, 3)
    expect(result.fileCount).toBe(1)
  })

  it('returns an empty restore when no snapshot precedes the target', async () => {
    const session = fakeSession('s1', workspace)
    const restored = await store.restore(session, 4)
    expect(restored).toEqual({ snapshotSeq: -1, restoredCount: 0 })
  })

  it('keeps snapshots per session id', async () => {
    await writeFile(join(workspace, 'a.txt'), 'v1', 'utf8')
    await store.capture(fakeSession('s1', workspace), 5)
    const other = await store.restore(fakeSession('s2', workspace), 5)
    expect(other.snapshotSeq).toBe(-1)
  })
})
