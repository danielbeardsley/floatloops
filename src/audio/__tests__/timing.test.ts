import { describe, expect, it } from 'vitest'
import {
  MAX_BPM,
  MIN_BPM,
  STEPS_PER_MEASURE,
  clampBpm,
  secondsPerBeat,
  secondsPerStep,
  stepCount,
  stepTime,
} from '../timing'

describe('clampBpm', () => {
  it('keeps sensible tempos untouched', () => {
    expect(clampBpm(120)).toBe(120)
  })

  it('clamps out-of-range tempos', () => {
    expect(clampBpm(5)).toBe(MIN_BPM)
    expect(clampBpm(10000)).toBe(MAX_BPM)
  })

  it('falls back to 120 for garbage input', () => {
    expect(clampBpm(Number.NaN)).toBe(120)
  })
})

describe('step timing', () => {
  it('puts four steps in a beat', () => {
    expect(secondsPerStep(120) * 4).toBeCloseTo(secondsPerBeat(120))
  })

  it('gives half a second per beat at 120bpm', () => {
    expect(secondsPerBeat(120)).toBeCloseTo(0.5)
    expect(secondsPerStep(120)).toBeCloseTo(0.125)
  })

  it('speeds up as bpm rises', () => {
    expect(secondsPerStep(240)).toBeLessThan(secondsPerStep(120))
  })
})

describe('stepTime', () => {
  it('fires step 0 exactly at the start time', () => {
    expect(stepTime(10, 120, 0)).toBe(10)
  })

  it('spaces steps evenly from the start time', () => {
    expect(stepTime(10, 120, 4)).toBeCloseTo(10.5)
    expect(stepTime(10, 120, 16)).toBeCloseTo(12)
  })

  it('does not accumulate drift, because each step is computed from the start', () => {
    // A running total of secondsPerStep would drift; this must not.
    const exact = stepTime(0, 137, 1000)
    expect(exact).toBeCloseTo(1000 * secondsPerStep(137), 10)
  })
})

describe('stepCount', () => {
  it('is a measure per measure', () => {
    expect(stepCount(1)).toBe(STEPS_PER_MEASURE)
    expect(stepCount(4)).toBe(4 * STEPS_PER_MEASURE)
  })

  it('never returns an empty pattern', () => {
    expect(stepCount(0)).toBe(STEPS_PER_MEASURE)
    expect(stepCount(-3)).toBe(STEPS_PER_MEASURE)
  })
})
