import { describe, expect, it } from 'vitest'
import { BackupError, backupFileName, createBackup, parseBackup } from '../backup'
import { DEFAULT_PREFERENCES } from '../preferences'
import { createEmptyPattern, demoPattern, isStepOn } from '../schema'
import { addRow, createEmptySong } from '../song'
import { KIT } from '../../audio/kit'

function envelope(fields: Record<string, unknown>) {
  return JSON.stringify({ app: 'floatloops', format: 1, patterns: [], songs: [], ...fields })
}

describe('a backup file', () => {
  it('reads back exactly what was written', () => {
    const pattern = { ...demoPattern(), id: 'beat', createdAt: 1, updatedAt: 2 }
    const song = { ...addRow(createEmptySong('Tune'), 'beat'), id: 'tune', createdAt: 3, updatedAt: 4 }
    const preferences = { ...DEFAULT_PREFERENCES, autoSave: true }

    const text = createBackup({ patterns: [pattern], songs: [song] }, preferences, 1234)
    const read = parseBackup(text)

    expect(read.library.patterns).toEqual([pattern])
    expect(read.library.songs).toEqual([song])
    expect(read.preferences).toEqual(preferences)
    expect(read.skipped).toBe(0)
    expect(read.exportedAt).toBe(1234)
  })

  it('is named for the day it was made', () => {
    expect(backupFileName(new Date(2026, 0, 5))).toBe('floatloops-backup-2026-01-05.json')
  })
})

describe('reading a file that is not a backup', () => {
  it.each([
    ['not JSON at all', 'hello'],
    ['some other JSON', '{"name":"shopping list"}'],
    ['a bare list', '[]'],
    ['another app', '{"app":"other","format":1}'],
  ])('refuses %s', (_, text) => {
    expect(() => parseBackup(text)).toThrow(BackupError)
    expect(() => parseBackup(text)).toThrow(/not a FloatLoops backup/)
  })

  it('refuses a backup from a newer version, and says what to do', () => {
    expect(() => parseBackup(envelope({ format: 2 }))).toThrow(/newer version/)
  })
})

describe('reading a damaged or old backup', () => {
  it('loads what it can and counts the rest', () => {
    const text = envelope({
      patterns: [{ ...createEmptyPattern('Good'), id: 'good' }, 'junk', { id: 'future', version: 99 }],
      songs: [null],
    })

    const read = parseBackup(text)
    expect(read.library.patterns.map((p) => p.id)).toEqual(['good'])
    expect(read.skipped).toBe(3)
  })

  it('skips a record with no id, rather than inventing one each time', () => {
    const { id: _, ...noId } = createEmptyPattern('Anonymous')
    const read = parseBackup(envelope({ patterns: [noId] }))

    expect(read.library.patterns).toEqual([])
    expect(read.skipped).toBe(1)
  })

  it('brings an old save up to date on the way in', () => {
    const text = envelope({
      patterns: [
        {
          id: 'legacy',
          name: 'Legacy',
          version: 1,
          measures: 1,
          tracks: [{ voiceId: 'kick', level: 0.9, muted: false, steps: [1, 0, 0, 0] }],
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    })

    const [pattern] = parseBackup(text).library.patterns
    expect(pattern.tracks).toHaveLength(KIT.length)
    expect(isStepOn(pattern.tracks[0], 0)).toBe(true)
  })

  it('treats missing lists as empty and missing preferences as none', () => {
    const read = parseBackup('{"app":"floatloops","format":1}')
    expect(read.library).toEqual({ patterns: [], songs: [] })
    expect(read.preferences).toBeNull()
  })

  it('forgets a preference it does not understand, keeping the rest', () => {
    const read = parseBackup(envelope({ preferences: { autoSave: true, melodyKey: 99 } }))
    expect(read.preferences).toEqual({ ...DEFAULT_PREFERENCES, autoSave: true })
  })
})
