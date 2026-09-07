import type { Engine } from './context'
import { getVoice } from './kit'
import { lead } from './voices/lead'
import { pitchFreq } from './scale'
import { secondsPerStep } from './timing'
import type { Arrangement, Voicing } from '../state/arrangement'

/**
 * The lookahead scheduler, after Chris Wilson's "A Tale of Two Clocks".
 *
 * A coarse JS timer wakes up often, looks a little way into the future, and
 * hands every note in that window to the audio thread with an exact start
 * time. The audio thread then plays them with sample accuracy, so main-thread
 * jank cannot make the beat stumble. Nothing here is allowed to depend on the
 * timer firing punctually -- only on it firing often enough.
 */

/** How often the timer wakes up, in milliseconds. */
export const TICK_MS = 25

/** How far ahead of now the scheduler commits notes, in seconds. */
export const LOOKAHEAD = 0.1

/** Breathing room before the first note, so it is never scheduled late. */
export const LEAD_IN = 0.06

/** Safety net: never schedule more than this many steps in one tick. */
const MAX_STEPS_PER_TICK = 64

/**
 * Where the pattern sits on the AudioContext clock: step `baseStep` falls
 * exactly at `baseTime`, and everything else is derived from that. Deriving
 * each step from a fixed base rather than accumulating a delta is what keeps a
 * long loop from drifting.
 */
export type TransportClock = {
  baseTime: number
  baseStep: number
}

export function timeOfStep(clock: TransportClock, bpm: number, absStep: number): number {
  return clock.baseTime + (absStep - clock.baseStep) * secondsPerStep(bpm)
}

export function stepAtTime(clock: TransportClock, bpm: number, time: number): number {
  return clock.baseStep + Math.floor((time - clock.baseTime) / secondsPerStep(bpm))
}

export type DueStep = { absStep: number; time: number }

/**
 * Pure: which steps fall inside the lookahead window, and where the scheduler
 * should resume next tick.
 */
export function collectDueSteps(
  clock: TransportClock,
  bpm: number,
  nextStep: number,
  now: number,
  lookahead: number = LOOKAHEAD,
  cap: number = MAX_STEPS_PER_TICK,
): { steps: DueStep[]; nextStep: number } {
  const horizon = now + lookahead
  const steps: DueStep[] = []

  let step = nextStep
  while (steps.length < cap) {
    const time = timeOfStep(clock, bpm, step)
    if (time >= horizon) break
    steps.push({ absStep: step, time })
    step += 1
  }

  return { steps, nextStep: step }
}

/**
 * Pure: moves the clock's origin onto the next unscheduled step, keeping that
 * step at the time it was already going to happen. Called when the tempo
 * changes mid-loop, so already-committed notes stay put and only later ones
 * take the new tempo.
 */
export function rebaseForTempoChange(
  clock: TransportClock,
  previousBpm: number,
  nextStep: number,
): TransportClock {
  return { baseTime: timeOfStep(clock, previousBpm, nextStep), baseStep: nextStep }
}

export type SequencerOptions = {
  engine: Engine
  /**
   * Read fresh each tick, so edits and tempo changes apply mid-loop. What it
   * returns decides whether a beat or a whole song is playing -- the clock
   * below neither knows nor cares which.
   */
  getArrangement: () => Arrangement
}

export class Sequencer {
  private readonly engine: Engine
  private readonly getArrangement: () => Arrangement

  private clock: TransportClock = { baseTime: 0, baseStep: 0 }
  private nextStep = 0
  private bpm = 0
  private timer: ReturnType<typeof setInterval> | null = null

  constructor(options: SequencerOptions) {
    this.engine = options.engine
    this.getArrangement = options.getArrangement
  }

  get isRunning(): boolean {
    return this.timer !== null
  }

  start(): void {
    if (this.isRunning) return

    this.bpm = this.getArrangement().bpm
    this.clock = { baseTime: this.engine.ctx.currentTime + LEAD_IN, baseStep: 0 }
    this.nextStep = 0

    // Fill the first window immediately; waiting a whole tick would delay the
    // downbeat by up to TICK_MS.
    this.tick()
    this.timer = setInterval(() => this.tick(), TICK_MS)
  }

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  /**
   * The step under the playhead right now, relative to the arrangement, or
   * null when stopped. Read by the UI's animation frame loop -- the playhead follows
   * the audio clock, never the other way round.
   */
  currentStep(): number | null {
    if (!this.isRunning) return null

    const length = this.getArrangement().steps
    const step = stepAtTime(this.clock, this.bpm, this.engine.ctx.currentTime)
    if (step < 0) return 0
    return ((step % length) + length) % length
  }

  /** Exposed so tests can drive the scheduler without real timers. */
  tick(): void {
    const arrangement = this.getArrangement()

    if (arrangement.bpm !== this.bpm) {
      this.clock = rebaseForTempoChange(this.clock, this.bpm, this.nextStep)
      this.bpm = arrangement.bpm
    }

    const { steps, nextStep } = collectDueSteps(
      this.clock,
      this.bpm,
      this.nextStep,
      this.engine.ctx.currentTime,
    )
    this.nextStep = nextStep

    const length = arrangement.steps
    for (const { absStep, time } of steps) {
      for (const voicing of arrangement.at(((absStep % length) + length) % length)) {
        this.play(voicing, time)
      }
    }
  }

  private play({ pattern, step, gain, melodyLevel }: Voicing, time: number): void {
    const { ctx, master } = this.engine

    for (const track of pattern.tracks) {
      // The section mute silences every drum, whatever the tracks say themselves.
      if (pattern.drumsMuted || track.muted) continue

      const velocity = track.steps[step] ?? 0
      if (velocity <= 0) continue

      getVoice(track.voiceId).trigger(ctx, master, time, {
        level: track.level * velocity * gain,
      })
    }

    // Muting is not a level, so a melody muted inside its beat stays muted
    // however loud the row it is playing on.
    if (pattern.melody.muted) return

    // The song row's fader replaces the beat's melody level rather than
    // scaling it; on its own, a beat uses the level it was written with.
    const level = melodyLevel ?? pattern.melody.level

    // A note is triggered once, on the step it starts, and told how long to
    // hold -- the sustain lives in the voice, not in the scheduler.
    const stepSeconds = secondsPerStep(this.bpm)
    for (const note of pattern.melody.notes) {
      if (note.start !== step) continue

      lead(ctx, master, time, {
        freq: pitchFreq(note.pitch),
        duration: note.length * stepSeconds,
        level: level * note.velocity,
      })
    }
  }
}
