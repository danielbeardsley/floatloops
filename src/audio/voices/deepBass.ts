import { LEVEL_FLOOR, TAIL, clamp, cleanupAfter } from './env'

/**
 * Deep Bass: a club bassline. One sawtooth an octave under the note, behind a
 * resonant lowpass that opens for an instant and then shuts down onto the
 * fundamental.
 *
 * The octave down is what makes it a bass at all: the roll's lowest note is
 * only a C3, which is where a tune lives rather than where a bassline does.
 * Everything written on the roll comes out an octave below what the labels
 * say, so a line drawn along the bottom lands where a house bass belongs.
 *
 * The whole sound is the filter sweep. A sawtooth is all harmonics, and left
 * alone at this pitch it is a buzz; dropping the cutoff from well above the
 * note to just above it, quickly, throws away that buzz but keeps the moment
 * of it at the front of every note. That moment is the punch, and it is also
 * what a tablet speaker can actually reproduce -- the fundamental down here is
 * felt more than heard. The resonance is what makes the drop sing rather than
 * merely happen.
 *
 * The sweep runs over a fixed time rather than over the note's own length, so
 * a long note settles and stays settled instead of sagging all the way
 * through.
 */

export type DeepBassOptions = {
  freq?: number
  /** How long to hold the note, in seconds, before letting it fall away. */
  duration?: number
  level?: number
}

export const DEEP_BASS_DEFAULTS: Required<DeepBassOptions> = {
  freq: 440,
  duration: 0.25,
  level: 0.5,
}

/** How far under the written note the whole voice plays. */
const OCTAVE_DOWN = 0.5

/** Quick, but not so quick it clicks. A bass note should land, not appear. */
const ATTACK = 0.01
/**
 * The note sags slowly while it is held: this is how long it would take to
 * fade out entirely, which is far longer than any note it will be given, so
 * in practice a held note only loses a little of itself.
 */
const DECAY = 3.4
/** Short: house basslines stop between notes, which is where the groove is. */
const RELEASE = 0.06

/**
 * Where the lowpass starts and ends, as multiples of the pitch being played.
 * Ratios rather than fixed frequencies so that a note high on the roll sweeps
 * the same way as one along the bottom instead of being filtered away.
 */
const OPEN = 9
const CLOSED = 1.6
/** How long it takes to close, whatever the note's own length. */
const SWEEP = 0.15
/** Resonance. Enough to sing as it closes, well short of self-oscillating. */
const FILTER_Q = 4

/**
 * How loud the voice runs for a given level. Under 1 because a sawtooth this
 * low carries far more energy than the same level up where the lead sits.
 */
const VOICE_LEVEL = 0.6

const MAX_HZ = 16000

/** Total time from the start of the note until it has fully died away. */
export function deepBassDuration(duration: number): number {
  return duration + RELEASE
}

export function resolveDeepBassParams(opts: DeepBassOptions = {}): Required<DeepBassOptions> {
  const d = DEEP_BASS_DEFAULTS
  return {
    freq: clamp(opts.freq ?? d.freq, 40, 4000, d.freq),
    // Never shorter than the attack, or the fall would be scheduled before
    // the note had finished arriving.
    duration: clamp(opts.duration ?? d.duration, ATTACK, 8, d.duration),
    level: clamp(opts.level ?? d.level, 0, 1, d.level),
  }
}

export type DeepBassEnvelopePoint = {
  time: number
  value: number
  ramp: 'set' | 'linear' | 'exponential'
}

/**
 * Pure: land, sag, stop. Held apart from the graph so the shape can be
 * checked without Web Audio -- particularly that the note is let go of
 * promptly, since a bass that overlaps the next note turns to mud.
 */
export function deepBassEnvelopePoints(
  when: number,
  level: number,
  duration: number,
): DeepBassEnvelopePoint[] {
  const peak = Math.max(level * VOICE_LEVEL, LEVEL_FLOOR * 2)
  const releaseAt = when + duration
  const held = Math.max(duration - ATTACK, 0)
  const sagged = Math.max(peak * (1 - Math.min(held / DECAY, 1)), LEVEL_FLOOR * 2)

  return [
    { time: when, value: 0, ramp: 'set' },
    { time: when + ATTACK, value: peak, ramp: 'linear' },
    { time: releaseAt, value: sagged, ramp: 'linear' },
    { time: releaseAt + RELEASE, value: LEVEL_FLOOR, ramp: 'exponential' },
  ]
}

export function deepBass(
  ctx: BaseAudioContext,
  destination: AudioNode,
  when: number,
  opts: DeepBassOptions = {},
): void {
  const p = resolveDeepBassParams(opts)
  const freq = p.freq * OCTAVE_DOWN
  const stopAt = when + deepBassDuration(p.duration) + TAIL

  const amp = ctx.createGain()
  for (const point of deepBassEnvelopePoints(when, p.level, p.duration)) {
    if (point.ramp === 'set') amp.gain.setValueAtTime(point.value, point.time)
    else if (point.ramp === 'linear') amp.gain.linearRampToValueAtTime(point.value, point.time)
    else amp.gain.exponentialRampToValueAtTime(point.value, point.time)
  }
  amp.connect(destination)

  const filter = ctx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.Q.setValueAtTime(FILTER_Q, when)
  filter.frequency.setValueAtTime(Math.min(freq * OPEN, MAX_HZ), when)
  // Never longer than the note itself, so a short one still gets to close.
  filter.frequency.exponentialRampToValueAtTime(
    freq * CLOSED,
    when + Math.min(SWEEP, p.duration),
  )
  filter.connect(amp)

  const osc = ctx.createOscillator()
  osc.type = 'sawtooth'
  osc.frequency.setValueAtTime(freq, when)
  osc.connect(filter)
  osc.start(when)
  osc.stop(stopAt)

  cleanupAfter(osc, [osc, filter, amp])
}
