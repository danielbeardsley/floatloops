import { totalSteps, type Pattern } from './schema'

/**
 * What the sequencer plays, whatever the user is editing.
 *
 * A beat and a song are the same thing to the audio engine: a length in steps
 * and, for any step in that length, the list of patterns sounding there. That
 * indirection is the only reason songs did not need a second scheduler.
 */

/** One pattern sounding at one step of the timeline. */
export type Voicing = {
  pattern: Pattern
  /** Which step *of that pattern* is due. */
  step: number
  /** Multiplied into every drum in it, so a song row can carry its own level. */
  gain: number
  /**
   * The melody's level, *replacing* the beat's own rather than scaling it.
   *
   * A beat's melody level is balanced against that beat's own drums, which is
   * the wrong question once it is one row among several -- and two faders in
   * series means the row's does not mean what it says. In a song the row fader
   * is the only control the arranger has, so for the melody it is the level.
   * Absent when a beat plays on its own, where its own level is the answer.
   */
  melodyLevel?: number
}

export type Arrangement = {
  bpm: number
  /** Total length in steps. The transport loops here. */
  steps: number
  /** What sounds at the given step, which the caller has already wrapped. */
  at: (step: number) => Voicing[]
}

/** The trivial arrangement: one pattern, looping on its own. */
export function patternArrangement(pattern: Pattern): Arrangement {
  return {
    bpm: pattern.bpm,
    steps: totalSteps(pattern),
    at: (step) => [{ pattern, step, gain: 1 }],
  }
}
