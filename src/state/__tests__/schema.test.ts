import { describe, expect, it } from 'vitest'
import {
  MAX_MEASURES,
  PATTERN_VERSION,
  addMeasure,
  canAddMeasure,
  createEmptyPattern,
  demoPattern,
  isStepOn,
  setMeasures,
  setPatternBpm,
  setStep,
  setTrackLevel,
  toggleMute,
  toggleStep,
  totalSteps,
} from '../schema'
import { STEPS_PER_MEASURE } from '../../audio/timing'
import { KIT } from '../../audio/kit'

describe('createEmptyPattern', () => {
  const pattern = createEmptyPattern()

  it('has one track per kit voice', () => {
    expect(pattern.tracks).toHaveLength(KIT.length)
    expect(pattern.tracks.map((t) => t.voiceId)).toEqual(KIT.map((v) => v.id))
  })

  it('starts as one silent measure', () => {
    expect(totalSteps(pattern)).toBe(STEPS_PER_MEASURE)
    for (const track of pattern.tracks) {
      expect(track.steps).toHaveLength(STEPS_PER_MEASURE)
      expect(track.steps.every((s) => s === 0)).toBe(true)
    }
  })

  it('stamps the format version, so old saves can be migrated later', () => {
    expect(pattern.version).toBe(PATTERN_VERSION)
  })

  it('gives each pattern its own id', () => {
    expect(createEmptyPattern().id).not.toBe(createEmptyPattern().id)
  })
})

describe('editing steps', () => {
  it('toggles a step on and back off', () => {
    const on = toggleStep(createEmptyPattern(), 0, 3)
    expect(isStepOn(on.tracks[0], 3)).toBe(true)
    expect(isStepOn(toggleStep(on, 0, 3).tracks[0], 3)).toBe(false)
  })

  it('leaves the original pattern untouched', () => {
    const before = createEmptyPattern()
    toggleStep(before, 0, 3)
    expect(isStepOn(before.tracks[0], 3)).toBe(false)
  })

  it('stores velocity, so accents can arrive without a format change', () => {
    const p = setStep(createEmptyPattern(), 0, 0, 0.5)
    expect(p.tracks[0].steps[0]).toBe(0.5)
    expect(isStepOn(p.tracks[0], 0)).toBe(true)
  })

  it('clamps velocity into 0..1', () => {
    expect(setStep(createEmptyPattern(), 0, 0, 9).tracks[0].steps[0]).toBe(1)
    expect(setStep(createEmptyPattern(), 0, 0, -9).tracks[0].steps[0]).toBe(0)
  })

  it('ignores steps beyond the end of the pattern', () => {
    const before = createEmptyPattern()
    expect(setStep(before, 0, 999, 1)).toBe(before)
  })

  it('ignores tracks that do not exist', () => {
    const before = createEmptyPattern()
    expect(toggleStep(before, 99, 0)).toBe(before)
  })
})

describe('track controls', () => {
  it('mutes and unmutes', () => {
    const muted = toggleMute(createEmptyPattern(), 1)
    expect(muted.tracks[1].muted).toBe(true)
    expect(toggleMute(muted, 1).tracks[1].muted).toBe(false)
  })

  it('clamps level into 0..1', () => {
    expect(setTrackLevel(createEmptyPattern(), 0, 5).tracks[0].level).toBe(1)
  })
})

describe('tempo', () => {
  it('clamps out-of-range tempos', () => {
    expect(setPatternBpm(createEmptyPattern(), 9999).bpm).toBeLessThanOrEqual(240)
  })
})

describe('measures', () => {
  it('pads every track with silence when growing', () => {
    const grown = addMeasure(toggleStep(createEmptyPattern(), 0, 0))
    expect(grown.measures).toBe(2)
    for (const track of grown.tracks) {
      expect(track.steps).toHaveLength(2 * STEPS_PER_MEASURE)
    }
    // The existing bar survives.
    expect(isStepOn(grown.tracks[0], 0)).toBe(true)
    expect(isStepOn(grown.tracks[0], STEPS_PER_MEASURE)).toBe(false)
  })

  it('truncates when shrinking', () => {
    const two = addMeasure(createEmptyPattern())
    const marked = toggleStep(two, 0, STEPS_PER_MEASURE + 2)
    const one = setMeasures(marked, 1)
    expect(one.tracks[0].steps).toHaveLength(STEPS_PER_MEASURE)
  })

  it('refuses to grow past the cap', () => {
    let pattern = createEmptyPattern()
    for (let i = 0; i < MAX_MEASURES + 3; i += 1) pattern = addMeasure(pattern)
    expect(pattern.measures).toBe(MAX_MEASURES)
    expect(canAddMeasure(pattern)).toBe(false)
  })

  it('never shrinks below one measure', () => {
    expect(setMeasures(createEmptyPattern(), 0).measures).toBe(1)
  })
})

describe('demoPattern', () => {
  const pattern = demoPattern()

  it('is not silent, so the first press of play does something', () => {
    const hits = pattern.tracks.flatMap((t) => t.steps).filter((s) => s > 0)
    expect(hits.length).toBeGreaterThan(0)
  })

  it('puts a kick on the downbeat', () => {
    const kick = pattern.tracks.find((t) => t.voiceId === 'kick')!
    expect(isStepOn(kick, 0)).toBe(true)
  })
})
