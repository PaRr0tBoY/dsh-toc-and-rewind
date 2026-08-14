// @vitest-environment jsdom
/**
 * Region selection and tool-pairing balance over a fake session surface.
 * @module dsh-toc-tail/rewind/tests/region
 */
import { describe, expect, it } from 'vitest'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { RewindError, cutBalances, openTurnOf, selectRewindRegion } from '../region.ts'

/** Build one session event with the minimal shape the region math reads. */
function ev(seq: number, type: string, data: unknown): SessionEvent {
  return { type, seq, time: seq * 1000, data } as unknown as SessionEvent
}

const user = (seq: number) => ev(seq, 'user/message', { content: [{ type: 'text', text: 'hi' }] })
const assistantText = (seq: number) => ev(seq, 'assistant/message', { message: { content: [{ type: 'text', text: 'ok' }] } })
const assistantToolCall = (seq: number) =>
  ev(seq, 'assistant/message', { message: { content: [{ type: 'tool-call', id: `c${seq}`, name: 'read', arguments: '{}' }] } })
const toolResult = (seq: number) => ev(seq, 'tool/result', { content: [{ type: 'tool-result', id: `c${seq}`, output: 'x' }] })

/** Region source over an explicit event log and surface order. */
function source(events: readonly SessionEvent[], nodes: readonly number[]) {
  return { events, surface: { nodes } }
}

describe('cutBalances', () => {
  it('marks cuts inside an open tool-call/result pair as unbalanced', () => {
    const events = [user(0), assistantToolCall(1), toolResult(2), assistantText(3)]
    expect(cutBalances(events, [0, 1, 2, 3])).toEqual([true, true, false, true, true])
  })

  it('rejects a tool/result without a matching call as corrupt', () => {
    const events = [user(0), toolResult(1)]
    expect(() => cutBalances(events, [0, 1])).toThrow(RewindError)
  })
})

describe('openTurnOf', () => {
  it('returns the open turn or null between turns', () => {
    expect(openTurnOf([
      ev(0, 'turn/start', { turn: 1 }),
      user(1),
      ev(2, 'turn/end', { turn: 1 }),
    ])).toBeNull()
    expect(openTurnOf([
      ev(0, 'turn/start', { turn: 2 }),
      user(1),
    ])).toBe(2)
  })
})

describe('selectRewindRegion', () => {
  it('folds every surface node after the target', () => {
    const events = [user(0), assistantToolCall(1), toolResult(2), assistantText(3), user(4), assistantText(5)]
    const region = selectRewindRegion(source(events, [0, 1, 2, 3, 4, 5]), 0)
    expect(region).toEqual({ start: 1, end: 5, shadowedSeqs: [1, 2, 3, 4, 5] })
  })

  it('skips to the next balanced cut instead of splitting a pair', () => {
    // user(0) targets a fold whose first following surface node is an
    // assistant tool-call that started before the target: the fold starts
    // only after the pair closes.
    const events = [user(0), assistantToolCall(1), toolResult(2), assistantText(3)]
    const region = selectRewindRegion(source(events, [0, 1, 2, 3]), 0)
    expect(region).toEqual({ start: 1, end: 3, shadowedSeqs: [1, 2, 3] })
  })

  it('rejects a target outside the current surface', () => {
    const events = [user(0), assistantText(1)]
    expect(() => selectRewindRegion(source(events, [0, 1]), 5)).toThrow(RewindError)
  })

  it('rejects a target with nothing after it', () => {
    const events = [user(0), assistantText(1)]
    expect(() => selectRewindRegion(source(events, [0, 1]), 1)).toThrow(RewindError)
  })
})
