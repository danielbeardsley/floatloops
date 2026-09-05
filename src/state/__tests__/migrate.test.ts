import { describe, expect, it } from 'vitest'
import { migratePattern } from '../migrate'
import { PATTERN_VERSION, createEmptyPattern, demoPattern, isStepOn } from '../schema'
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
    const saved = {
      ...createEmptyPattern(),
      tracks: [{ voiceId: 'vibraslap', level: 1, muted: false, steps: [1] }],
    }
    expect(migratePattern(saved)!.tracks).toHaveLength(KIT.length)
  })

  it('keeps the steps of a drum even when the kit order changed', () => {
    const saved = {
      ...createEmptyPattern(),
      tracks: [{ voiceId: 'cowbell', level: 0.5, muted: true, steps: [0, 1] }],
    }
    const migrated = migratePattern(saved)!
    const cowbell = migrated.tracks.find((t) => t.voiceId === 'cowbell')!
    expect(isStepOn(cowbell, 1)).toBe(true)
    expect(cowbell.muted).toBe(true)
    expect(cowbell.level).toBe(0.5)
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
