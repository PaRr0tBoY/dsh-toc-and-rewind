// @vitest-environment jsdom
/**
 * Slash-command argument parsing.
 * @module dsh-toc-tail/rewind/tests/command
 */
import { describe, expect, it } from 'vitest'
import { parseRewindArgs } from '../command.ts'
import { RewindError } from '../region.ts'

describe('parseRewindArgs', () => {
  it('parses a bare seq with no actions', () => {
    expect(parseRewindArgs('42')).toEqual({ seq: 42, options: { code: false, summary: false } })
  })

  it('parses each action flag', () => {
    expect(parseRewindArgs('42 code')).toEqual({ seq: 42, options: { code: true, summary: false } })
    expect(parseRewindArgs('42 summary')).toEqual({ seq: 42, options: { code: false, summary: true } })
    expect(parseRewindArgs('42 code summary')).toEqual({ seq: 42, options: { code: true, summary: true } })
  })

  it('tolerates extra whitespace', () => {
    expect(parseRewindArgs('  42  code  ')).toEqual({ seq: 42, options: { code: true, summary: false } })
  })

  it('rejects a non-numeric or unknown target', () => {
    expect(() => parseRewindArgs('abc')).toThrow(RewindError)
    expect(() => parseRewindArgs('')).toThrow(RewindError)
    expect(() => parseRewindArgs('-1')).toThrow(RewindError)
  })

  it('rejects unknown flags', () => {
    expect(() => parseRewindArgs('42 bogus')).toThrow(RewindError)
  })
})
