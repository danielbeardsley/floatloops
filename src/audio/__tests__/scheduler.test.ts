import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  LEAD_IN,
  LOOKAHEAD,
  Sequencer,
  collectDueSteps,
  rebaseForTempoChange,
  stepAtTime,
  timeOfStep,
} from '../scheduler'
import { secondsPerStep } from '../timing'
import { addNote, createEmptyPattern, setStep, toggleMute, type Pattern } from '../../state/schema'
import { patternArrangement } from '../../state/arrangement'
import { MockAudioContext, asAudioContext } from '../../test/mockAudioContext'
import type { Engine } from '../context'

const CLOCK = { baseTime: 0, baseStep: 0 }
const BPM = 120
const STEP = secondsPerStep(BPM) // 0.125s

describe('timeOfStep', () => {
  it('places the base step at the base time', () => {
    expect(timeOfStep(CLOCK, BPM, 0)).toBe(0)
  })

  it('spaces later steps evenly', () => {
    expect(timeOfStep(CLOCK, BPM, 8)).toBeCloseTo(1)
  })

  it('works from a shifted origin', () => {
    expect(timeOfStep({ baseTime: 5, baseStep: 4 }, BPM, 6)).toBeCloseTo(5.25)
  })
})

describe('stepAtTime', () => {
  it('is the inverse of timeOfStep', () => {
    expect(stepAtTime(CLOCK, BPM, timeOfStep(CLOCK, BPM, 7))).toBe(7)
  })

  it('stays on a step until the next one is due', () => {
    expect(stepAtTime(CLOCK, BPM, STEP * 2 + STEP * 0.9)).toBe(2)
  })
})

describe('collectDueSteps', () => {
  it('takes only the steps inside the lookahead window', () => {
    const { steps } = collectDueSteps(CLOCK, BPM, 0, 0, LOOKAHEAD)
    // At 120bpm a 100ms window holds exactly the step at t=0.
    expect(steps.map((s) => s.absStep)).toEqual([0])
  })

  it('reports where to resume next tick', () => {
    const { nextStep } = collectDueSteps(CLOCK, BPM, 0, 0, LOOKAHEAD)
    expect(nextStep).toBe(1)
  })

  it('returns nothing when the next step is still beyond the horizon', () => {
    const { steps, nextStep } = collectDueSteps(CLOCK, BPM, 5, 0, LOOKAHEAD)
    expect(steps).toEqual([])
    expect(nextStep).toBe(5)
  })

  it('catches up when the timer fired late', () => {
    // The tick was 400ms late; every missed step must still be scheduled.
    const { steps } = collectDueSteps(CLOCK, BPM, 0, 0.4, LOOKAHEAD)
    expect(steps.map((s) => s.absStep)).toEqual([0, 1, 2, 3])
  })

  it('leaves a step landing exactly on the horizon to the next tick', () => {
    // The window is half-open, so a step is never claimed by two ticks.
    const { steps } = collectDueSteps(CLOCK, BPM, 4, 0.4, LOOKAHEAD)
    expect(steps).toEqual([])
    expect(timeOfStep(CLOCK, BPM, 4)).toBeCloseTo(0.5)
  })

  it('refuses to schedule an unbounded number of steps at once', () => {
    const { steps } = collectDueSteps(CLOCK, BPM, 0, 1e6, LOOKAHEAD)
    expect(steps.length).toBeLessThanOrEqual(64)
  })

  it('hands back exact times, not rounded ones', () => {
    const { steps } = collectDueSteps(CLOCK, BPM, 0, 0.4, LOOKAHEAD)
    expect(steps[3].time).toBeCloseTo(3 * STEP, 10)
  })
})

describe('rebaseForTempoChange', () => {
  it('leaves the next unscheduled step exactly where it was going to happen', () => {
    const before = timeOfStep(CLOCK, BPM, 4)
    const rebased = rebaseForTempoChange(CLOCK, BPM, 4)
    expect(timeOfStep(rebased, 240, 4)).toBeCloseTo(before)
  })

  it('applies the new tempo only to steps after that point', () => {
    const rebased = rebaseForTempoChange(CLOCK, BPM, 4)
    const gap = timeOfStep(rebased, 240, 5) - timeOfStep(rebased, 240, 4)
    expect(gap).toBeCloseTo(secondsPerStep(240))
  })
})

describe('Sequencer', () => {
  let ctx: MockAudioContext
  let engine: Engine
  let pattern: Pattern

  function makeSequencer() {
    return new Sequencer({ engine, getArrangement: () => patternArrangement(pattern) })
  }

  /** A pattern where only the kick makes a sound, so oscillators can be counted. */
  function kickOnly(steps: number[]): Pattern {
    return steps.reduce((p, step) => setStep(p, 0, step, 1), createEmptyPattern('t'))
  }

  beforeEach(() => {
    vi.useFakeTimers()
    ctx = new MockAudioContext()
    const master = ctx.createGain()
    engine = { ctx: asAudioContext(ctx), master: master as unknown as GainNode }
    pattern = kickOnly([0])
    pattern.bpm = BPM
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('schedules the downbeat as soon as it starts, without waiting for a tick', () => {
    const seq = makeSequencer()
    seq.start()
    expect(ctx.oscillators).toHaveLength(1)
    seq.stop()
  })

  it('starts slightly ahead of now, so the downbeat is never late', () => {
    const seq = makeSequencer()
    seq.start()
    expect(ctx.oscillators[0].startedAt).toBeCloseTo(LEAD_IN)
    seq.stop()
  })

  it('schedules further steps as time advances', () => {
    const seq = makeSequencer()
    pattern = kickOnly([0, 1, 2, 3])
    pattern.bpm = BPM
    seq.start()
    ctx.currentTime = 0.5
    seq.tick()
    expect(ctx.oscillators).toHaveLength(4)
    seq.stop()
  })

  it('never schedules the same step twice', () => {
    const seq = makeSequencer()
    seq.start()
    seq.tick()
    seq.tick()
    expect(ctx.oscillators).toHaveLength(1)
    seq.stop()
  })

  it('loops back to the start of the pattern', () => {
    const seq = makeSequencer()
    seq.start()
    // Far enough ahead to pass the end of the single measure.
    ctx.currentTime = 2
    seq.tick()
    // Step 0 fires once per lap: the downbeat, then the loop point.
    expect(ctx.oscillators).toHaveLength(2)
    seq.stop()
  })

  it('stays silent on a muted track', () => {
    pattern = toggleMute(kickOnly([0, 1, 2, 3]), 0)
    pattern.bpm = BPM
    const seq = makeSequencer()
    seq.start()
    ctx.currentTime = 0.5
    seq.tick()
    expect(ctx.oscillators).toHaveLength(0)
    seq.stop()
  })

  it('scales the hit by both track level and step velocity', () => {
    pattern = setStep(createEmptyPattern('t'), 0, 0, 0.5)
    pattern.bpm = BPM
    pattern.tracks[0].level = 0.8
    const seq = makeSequencer()
    seq.start()

    // gains[0] is the engine master; gains[1] is the kick's amplitude envelope.
    const attack = ctx.gains[1].gain.events.find((e) => e.method === 'linearRampToValueAtTime')
    expect(attack?.value).toBeCloseTo(0.4)
    seq.stop()
  })

  it('picks up edits made while it is running', () => {
    const seq = makeSequencer()
    seq.start()
    pattern = kickOnly([0, 1, 2, 3])
    pattern.bpm = BPM
    ctx.currentTime = 0.5
    seq.tick()
    expect(ctx.oscillators.length).toBeGreaterThan(1)
    seq.stop()
  })

  it('does not re-schedule committed notes when the tempo changes', () => {
    const seq = makeSequencer()
    seq.start()
    const before = ctx.oscillators.length
    pattern = { ...pattern, bpm: 200 }
    seq.tick()
    expect(ctx.oscillators).toHaveLength(before)
    seq.stop()
  })

  it('reports no playhead when stopped', () => {
    expect(makeSequencer().currentStep()).toBeNull()
  })

  it('follows the audio clock while playing', () => {
    const seq = makeSequencer()
    seq.start()
    ctx.currentTime = LEAD_IN + 3 * STEP
    expect(seq.currentStep()).toBe(3)
    seq.stop()
  })

  it('wraps the playhead back to zero at the loop point', () => {
    const seq = makeSequencer()
    seq.start()
    ctx.currentTime = LEAD_IN + 16 * STEP
    expect(seq.currentStep()).toBe(0)
    seq.stop()
  })

  it('holds the playhead at the start during the lead-in', () => {
    const seq = makeSequencer()
    seq.start()
    expect(seq.currentStep()).toBe(0)
    seq.stop()
  })

  it('stops scheduling once stopped', () => {
    const seq = makeSequencer()
    seq.start()
    seq.stop()
    const before = ctx.oscillators.length
    vi.advanceTimersByTime(1000)
    expect(ctx.oscillators).toHaveLength(before)
  })

  it('ignores a second start while already running', () => {
    const seq = makeSequencer()
    seq.start()
    seq.start()
    expect(ctx.oscillators).toHaveLength(1)
    seq.stop()
  })
})

describe('Sequencer and the melody', () => {
  let ctx: MockAudioContext
  let engine: Engine
  let pattern: Pattern

  /** Only the melody sounds, so oscillators can be attributed to notes. */
  function noteOnly(draft: { pitch: number; start: number; length: number }): Pattern {
    return { ...addNote(createEmptyPattern('t'), draft), bpm: BPM }
  }

  function makeSequencer() {
    return new Sequencer({ engine, getArrangement: () => patternArrangement(pattern) })
  }

  beforeEach(() => {
    vi.useFakeTimers()
    ctx = new MockAudioContext()
    const master = ctx.createGain()
    engine = { ctx: asAudioContext(ctx), master: master as unknown as GainNode }
    pattern = noteOnly({ pitch: 0, start: 0, length: 4 })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('plays a note when its first step comes round', () => {
    const seq = makeSequencer()
    seq.start()
    // The lead is one oscillator plus a sub an octave down.
    expect(ctx.oscillators).toHaveLength(2)
    seq.stop()
  })

  it('triggers a held note once, not on every step it covers', () => {
    const seq = makeSequencer()
    seq.start()
    ctx.currentTime = 0.5
    seq.tick()
    expect(ctx.oscillators).toHaveLength(2)
    seq.stop()
  })

  it('holds a long note for longer than a short one', () => {
    const seq = makeSequencer()
    seq.start()
    const long = ctx.oscillators[0].stoppedAt! - ctx.oscillators[0].startedAt!
    seq.stop()

    const shortCtx = new MockAudioContext()
    const shortMaster = shortCtx.createGain()
    pattern = noteOnly({ pitch: 0, start: 0, length: 1 })
    const shortSeq = new Sequencer({
      engine: { ctx: asAudioContext(shortCtx), master: shortMaster as unknown as GainNode },
      getArrangement: () => patternArrangement(pattern),
    })
    shortSeq.start()
    const short = shortCtx.oscillators[0].stoppedAt! - shortCtx.oscillators[0].startedAt!
    shortSeq.stop()

    expect(long).toBeGreaterThan(short)
  })

  it('measures a note in steps, so it stretches with the tempo', () => {
    const fast = makeSequencer()
    fast.start()
    const atDefault = ctx.oscillators[0].stoppedAt! - ctx.oscillators[0].startedAt!
    fast.stop()

    const slowCtx = new MockAudioContext()
    const slowMaster = slowCtx.createGain()
    pattern = { ...pattern, bpm: 60 }
    const slow = new Sequencer({
      engine: { ctx: asAudioContext(slowCtx), master: slowMaster as unknown as GainNode },
      getArrangement: () => patternArrangement(pattern),
    })
    slow.start()
    const atHalfSpeed = slowCtx.oscillators[0].stoppedAt! - slowCtx.oscillators[0].startedAt!
    slow.stop()

    expect(atHalfSpeed).toBeGreaterThan(atDefault)
  })

  it('stays silent when the melody is muted', () => {
    pattern = { ...pattern, melody: { ...pattern.melody, muted: true } }
    const seq = makeSequencer()
    seq.start()
    expect(ctx.oscillators).toHaveLength(0)
    seq.stop()
  })

  it('plays drums and melody together', () => {
    pattern = setStep(noteOnly({ pitch: 0, start: 0, length: 2 }), 0, 0, 1)
    const seq = makeSequencer()
    seq.start()
    // One kick plus the lead's two oscillators.
    expect(ctx.oscillators).toHaveLength(3)
    seq.stop()
  })
})
