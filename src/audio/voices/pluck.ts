import { TAIL, clamp, cleanupAfter, percussiveEnvelope } from './env'

/**
 * Pluck: a string picked and let go of.
 *
 * A sawtooth under a filter that shuts almost immediately -- the same idea as
 * the bass voice, an octave or two up and much faster, which is what turns a
 * buzz into a plucked string.
 *
 * A plucked string dies away on its own, so a long note rings longer without
 * ever sustaining the way the lead does. That is the point of having it: it is
 * the voice for playing lots of quick notes.
 */

export type PluckOptions = {
  freq?: number
  /** How long the note is held, in seconds. The ring grows with it. */
  duration?: number
  level?: number
}

export const PLUCK_DEFAULTS: Required<PluckOptions> = {
  freq: 440,
  duration: 0.25,
  level: 0.45,
}

/** How long the string rings on past the end of the note. */
const RING = 0.18
/** Longer notes ring longer, but a pluck never becomes a pad. */
const MAX_RING = 1.2

/** Where the filter opens to and settles, as multiples of the pitch. */
const OPEN = 9
const CLOSED = 1.8
const FILTER_Q = 4
const MAX_HZ = 16000

/** Total time from the start of the note until the string has died away. */
export function pluckDuration(duration: number): number {
  return Math.min(duration + RING, MAX_RING)
}

export function resolvePluckParams(opts: PluckOptions = {}): Required<PluckOptions> {
  const d = PLUCK_DEFAULTS
  return {
    freq: clamp(opts.freq ?? d.freq, 40, 4000, d.freq),
    duration: clamp(opts.duration ?? d.duration, 0.05, 8, d.duration),
    level: clamp(opts.level ?? d.level, 0, 1, d.level),
  }
}

export function pluck(
  ctx: BaseAudioContext,
  destination: AudioNode,
  when: number,
  opts: PluckOptions = {},
): void {
  const p = resolvePluckParams(opts)
  const ring = pluckDuration(p.duration)

  const amp = ctx.createGain()
  percussiveEnvelope(amp.gain, when, p.level, ring)

  const filter = ctx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.Q.value = FILTER_Q
  filter.frequency.setValueAtTime(Math.min(p.freq * OPEN, MAX_HZ), when)
  // The filter shuts in a fraction of the ring: the bright part of a pluck is
  // the pick itself, and everything after it is the string settling.
  filter.frequency.exponentialRampToValueAtTime(
    Math.min(p.freq * CLOSED, MAX_HZ),
    when + ring * 0.3,
  )

  const osc = ctx.createOscillator()
  osc.type = 'sawtooth'
  osc.frequency.setValueAtTime(p.freq, when)
  osc.connect(filter).connect(amp).connect(destination)

  osc.start(when)
  osc.stop(when + ring + TAIL)
  cleanupAfter(osc, [osc, filter, amp])
}
