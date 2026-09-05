import { describe, expect, it } from 'vitest'
import { LEAD_DEFAULTS, lead, leadDuration, leadEnvelopePoints, resolveLeadParams } from '../voices/lead'
import { PITCH_COUNT, SCALE, isPitch, pitchFreq, pitchName } from '../scale'
import { MockAudioContext, asAudioContext, asAudioNode } from '../../test/mockAudioContext'

describe('the scale', () => {
  it('rises', () => {
    for (let i = 1; i < SCALE.length; i += 1) {
      expect(SCALE[i].freq).toBeGreaterThan(SCALE[i - 1].freq)
    }
  })

  it('is pentatonic, so nothing in it can clash', () => {
    // Five notes to the octave: the sixth is double the first.
    expect(SCALE[5].freq).toBeCloseTo(SCALE[0].freq * 2, 1)
  })

  it('knows which pitches exist', () => {
    expect(isPitch(0)).toBe(true)
    expect(isPitch(PITCH_COUNT - 1)).toBe(true)
    expect(isPitch(PITCH_COUNT)).toBe(false)
    expect(isPitch(-1)).toBe(false)
    expect(isPitch(1.5)).toBe(false)
  })

  it('clamps rather than throwing when looked up out of range', () => {
    expect(pitchFreq(-5)).toBe(SCALE[0].freq)
    expect(pitchFreq(999)).toBe(SCALE[PITCH_COUNT - 1].freq)
    expect(pitchName(0)).toBe(SCALE[0].name)
  })
})

describe('lead envelope', () => {
  const points = leadEnvelopePoints(0, 0.5, 1)

  it('holds the note until it is supposed to end', () => {
    const release = points.at(-1)!
    const hold = points.at(-2)!
    expect(hold.time).toBe(1)
    expect(release.time).toBeGreaterThan(1)
  })

  it('sustains below its peak rather than decaying to nothing', () => {
    const peak = points[1].value
    const sustain = points[2].value
    expect(sustain).toBeLessThan(peak)
    expect(sustain).toBeGreaterThan(0.1 * peak)
  })

  it('schedules every point in increasing time order', () => {
    for (let i = 1; i < points.length; i += 1) {
      expect(points[i].time).toBeGreaterThanOrEqual(points[i - 1].time)
    }
  })

  it('stays in order for the shortest note the voice allows', () => {
    const shortest = resolveLeadParams({ duration: 0 }).duration
    const short = leadEnvelopePoints(0, 0.5, shortest)
    for (let i = 1; i < short.length; i += 1) {
      expect(short[i].time).toBeGreaterThanOrEqual(short[i - 1].time)
    }
  })

  it('never ramps to a value Web Audio would reject', () => {
    for (const point of leadEnvelopePoints(0, 0, 1)) {
      if (point.ramp === 'exponential') expect(point.value).toBeGreaterThan(0)
    }
  })

  it('outlives the note it was asked for, by the release', () => {
    expect(leadDuration(1)).toBeGreaterThan(1)
  })
})

describe('lead', () => {
  function play(opts = {}) {
    const ctx = new MockAudioContext()
    lead(asAudioContext(ctx), asAudioNode(ctx.destination), 0, opts)
    return ctx
  }

  it('plays the pitch it was given, with a sub an octave below', () => {
    const ctx = play({ freq: 440 })
    const pitches = ctx.oscillators.map((o) => o.frequency.events[0].value)
    expect(pitches).toEqual([440, 220])
  })

  it('holds a long note longer than a short one', () => {
    const short = play({ duration: 0.2 }).oscillators[0].stoppedAt!
    const long = play({ duration: 1.5 }).oscillators[0].stoppedAt!
    expect(long).toBeGreaterThan(short)
  })

  it('keeps both oscillators running for the whole note', () => {
    const ctx = play({ duration: 0.8 })
    const [osc, sub] = ctx.oscillators
    expect(sub.stoppedAt).toBe(osc.stoppedAt)
    expect(osc.stoppedAt).toBeGreaterThan(0.8)
  })

  it('falls back to a sensible note for nonsense input', () => {
    expect(resolveLeadParams({ freq: Number.NaN }).freq).toBe(LEAD_DEFAULTS.freq)
    expect(() => play({ duration: -10, level: 99 })).not.toThrow()
  })
})
