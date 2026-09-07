import { describe, expect, it } from 'vitest'
import { migratePattern } from '../migrate'
import { PATTERN_VERSION, createEmptyPattern, demoPattern, isStepOn } from '../schema'
import { pitchName } from '../../audio/scale'
import { KIT, VOICE_IDS } from '../../audio/kit'
import { STEPS_PER_MEASURE } from '../../audio/timing'

describe('migratePattern', () => {
  it('passes a pattern this build wrote straight through', () => {
    const pattern = demoPattern()
    expect(migratePattern(pattern)).toEqual(pattern)
  })

  it('rejects anything that is not an object', () => {
    for (const junk of [null, undefined, 42, 'beat', [], true]) {
      expect(migratePattern(junk)).toBeNull()
    }
  })

  it('refuses a pattern from a newer build rather than mangling it', () => {
    const future = { ...createEmptyPattern(), version: PATTERN_VERSION + 1 }
    expect(migratePattern(future)).toBeNull()
  })
})

describe('migratePattern rebuilds tracks from the current kit', () => {
  it('fills in a drum the save is missing', () => {
    const saved = { ...createEmptyPattern(), tracks: [] }
    const migrated = migratePattern(saved)!
    expect(migrated.tracks.map((t) => t.voiceId)).toEqual([...VOICE_IDS])
    expect(migrated.tracks[0].level).toBe(KIT[0].defaultLevel)
  })

  it('drops a drum this build no longer has', () => {
    // The cowbell was a real voice once; a beat saved with it still loads.
    const saved = {
      ...createEmptyPattern(),
      tracks: [{ voiceId: 'cowbell', level: 1, muted: false, steps: [1] }],
    }
    const migrated = migratePattern(saved)!
    expect(migrated.tracks).toHaveLength(KIT.length)
    expect(migrated.tracks.some((t) => (t.voiceId as string) === 'cowbell')).toBe(false)
  })

  it('keeps the steps of a drum even when the kit order changed', () => {
    const saved = {
      ...createEmptyPattern(),
      tracks: [{ voiceId: 'stab', level: 0.5, muted: true, steps: [0, 1] }],
    }
    const migrated = migratePattern(saved)!
    const stab = migrated.tracks.find((t) => t.voiceId === 'stab')!
    expect(isStepOn(stab, 1)).toBe(true)
    expect(stab.muted).toBe(true)
    expect(stab.level).toBe(0.5)
  })
})

describe('migratePattern repairs bad values', () => {
  function withTrack(steps: unknown, extra: Record<string, unknown> = {}) {
    const base = createEmptyPattern()
    return migratePattern({
      ...base,
      ...extra,
      tracks: [{ voiceId: 'kick', level: 0.8, muted: false, steps }],
    })!
  }

  it('pads short step arrays and truncates long ones', () => {
    expect(withTrack([1, 1]).tracks[0].steps).toHaveLength(STEPS_PER_MEASURE)
    expect(withTrack(new Array(999).fill(1)).tracks[0].steps).toHaveLength(STEPS_PER_MEASURE)
  })

  it('matches step count to the measure count', () => {
    const migrated = withTrack([1], { measures: 3 })
    expect(migrated.tracks[0].steps).toHaveLength(3 * STEPS_PER_MEASURE)
  })

  it('accepts booleans, so a pre-velocity save still loads', () => {
    expect(withTrack([true, false, true]).tracks[0].steps.slice(0, 3)).toEqual([1, 0, 1])
  })

  it('zeroes out garbage steps rather than dropping the pattern', () => {
    expect(withTrack(['x', null, Number.NaN]).tracks[0].steps.slice(0, 3)).toEqual([0, 0, 0])
  })

  it('clamps velocity, level, tempo and measures into range', () => {
    const migrated = migratePattern({
      ...createEmptyPattern(),
      bpm: 100000,
      measures: 999,
      tracks: [{ voiceId: 'kick', level: 12, muted: false, steps: [7] }],
    })!
    expect(migrated.bpm).toBeLessThanOrEqual(240)
    expect(migrated.measures).toBeLessThanOrEqual(8)
    expect(migrated.tracks[0].level).toBe(1)
    expect(migrated.tracks[0].steps[0]).toBe(1)
  })

  it('invents an id and a name when they are missing', () => {
    const migrated = migratePattern({ version: 1, measures: 1, tracks: [] })!
    expect(migrated.id.length).toBeGreaterThan(0)
    expect(migrated.name).toBe('Untitled')
  })

  it('stamps the current format version', () => {
    expect(migratePattern({ version: 0, tracks: [] })!.version).toBe(PATTERN_VERSION)
  })
})

describe('migratePattern and the melody', () => {
  function withMelody(melody: unknown, measures = 1) {
    return migratePattern({ ...createEmptyPattern(), measures, melody })!
  }

  it('gives a pattern saved before the melody existed an empty one', () => {
    const legacy = { ...createEmptyPattern(), version: 1 }
    delete (legacy as Partial<Record<string, unknown>>).melody
    const migrated = migratePattern(legacy)!
    expect(migrated.melody.notes).toEqual([])
    expect(migrated.melody.muted).toBe(false)
  })

  it('keeps notes that make sense', () => {
    const migrated = withMelody({
      level: 0.5,
      muted: true,
      notes: [{ id: 'n1', pitch: 2, start: 4, length: 3, velocity: 1 }],
    })
    expect(migrated.melody.notes).toHaveLength(1)
    expect(migrated.melody.notes[0]).toMatchObject({ pitch: 2, start: 4, length: 3 })
    expect(migrated.melody.muted).toBe(true)
    expect(migrated.melody.level).toBe(0.5)
  })

  it('drops a note at a pitch this build does not have', () => {
    const migrated = withMelody({ notes: [{ pitch: 99, start: 0, length: 1 }] })
    expect(migrated.melody.notes).toEqual([])
  })

  it('drops a note starting past the end of the pattern', () => {
    const migrated = withMelody({ notes: [{ pitch: 0, start: 500, length: 1 }] })
    expect(migrated.melody.notes).toEqual([])
  })

  it('clamps a note that runs off the end, since that has an obvious fix', () => {
    const migrated = withMelody({ notes: [{ pitch: 0, start: 14, length: 99 }] })
    expect(migrated.melody.notes[0].length).toBe(2)
  })

  it('invents an id for a note that lost one', () => {
    const migrated = withMelody({ notes: [{ pitch: 0, start: 0, length: 1 }] })
    expect(migrated.melody.notes[0].id.length).toBeGreaterThan(0)
  })

  it('lifts pitches saved before the scale grew downwards, so old melodies still sound the same', () => {
    // Pitch 0 meant A3 when the scale started there; A3 is four rows up now.
    const legacy = {
      ...createEmptyPattern(),
      version: 2,
      melody: { notes: [{ id: 'n1', pitch: 0, start: 0, length: 1 }] },
    }
    const note = migratePattern(legacy)!.melody.notes[0]
    expect(note.pitch).toBe(4)
    expect(pitchName(note.pitch)).toBe('A3')
  })

  it('leaves pitches alone once they were saved against the current scale', () => {
    const migrated = withMelody({ notes: [{ pitch: 0, start: 0, length: 1 }] })
    expect(migrated.melody.notes[0].pitch).toBe(0)
  })

  it('ignores junk in the notes list without losing the good ones', () => {
    const migrated = withMelody({
      notes: [null, 'note', { pitch: 1, start: 2, length: 2 }, 42],
    })
    expect(migrated.melody.notes).toHaveLength(1)
  })
})
