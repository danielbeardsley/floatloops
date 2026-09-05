import { LEVEL_FLOOR, TAIL, clamp, cleanupAfter } from './env'

/**
 * Lead: the one voice that is played rather than struck.
 *
 * Every drum in the kit decides its own length. This one is told how long to
 * hold, so it needs a real sustain and release instead of a decay -- which is
 * what makes notes with a start and an end possible at all.
 */

export type LeadOptions = {
  freq?: number
  /** How long to hold the note, in seconds, before releasing. */
  duration?: number
  level?: number
}

export const LEAD_DEFAULTS: Required<LeadOptions> = {
  freq: 440,
  duration: 0.25,
  level: 0.45,
}

const ATTACK = 0.008
const DECAY = 0.06
/** Fraction of peak the note settles to while held. */
const SUSTAIN = 0.65
const RELEASE = 0.12

/** Body an octave below the melody, kept quiet so it thickens without muddying. */
const SUB_LEVEL = 0.35

const FILTER_Q = 1.2
const MAX_HZ = 16000

export function resolveLeadParams(opts: LeadOptions = {}): Required<LeadOptions> {
  const d = LEAD_DEFAULTS
  return {
    freq: clamp(opts.freq ?? d.freq, 40, 4000, d.freq),
    // Never shorter than the attack and decay, or the envelope points would
    // be scheduled out of order.
    duration: clamp(opts.duration ?? d.duration, ATTACK + DECAY, 8, d.duration),
    level: clamp(opts.level ?? d.level, 0, 1, d.level),
  }
}

export type LeadEnvelopePoint = {
  time: number
  value: number
  ramp: 'set' | 'linear' | 'exponential'
}

/**
 * Pure: attack, decay, hold, release, as scheduled points. Held separately so
 * the shape can be checked without a Web Audio graph -- particularly that the
 * release begins when the note is supposed to end.
 */
export function leadEnvelopePoints(
  when: number,
  level: number,
  duration: number,
): LeadEnvelopePoint[] {
  const peak = Math.max(level, LEVEL_FLOOR * 2)
  const sustain = Math.max(peak * SUSTAIN, LEVEL_FLOOR)
  const releaseAt = when + duration

  return [
    { time: when, value: 0, ramp: 'set' },
    { time: when + ATTACK, value: peak, ramp: 'linear' },
    { time: when + ATTACK + DECAY, value: sustain, ramp: 'exponential' },
    // Holding the sustain here is what stops the decay ramp running on into
    // the release and swallowing the note's body.
    { time: releaseAt, value: sustain, ramp: 'set' },
    { time: releaseAt + RELEASE, value: LEVEL_FLOOR, ramp: 'exponential' },
  ]
}

/** Total time from `when` until the note has fully died away. */
export function leadDuration(duration: number): number {
  return duration + RELEASE
}

export function lead(
  ctx: BaseAudioContext,
  destination: AudioNode,
  when: number,
  opts: LeadOptions = {},
): void {
  const p = resolveLeadParams(opts)

  const amp = ctx.createGain()
  for (const point of leadEnvelopePoints(when, p.level, p.duration)) {
    if (point.ramp === 'set') amp.gain.setValueAtTime(point.value, point.time)
    else if (point.ramp === 'linear') amp.gain.linearRampToValueAtTime(point.value, point.time)
    else amp.gain.exponentialRampToValueAtTime(point.value, point.time)
  }
  amp.connect(destination)

  const filter = ctx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.Q.value = FILTER_Q
  filter.frequency.setValueAtTime(Math.min(p.freq * 8, MAX_HZ), when)
  filter.frequency.exponentialRampToValueAtTime(
    Math.min(p.freq * 4, MAX_HZ),
    when + ATTACK + DECAY,
  )
  filter.connect(amp)

  const stopAt = when + leadDuration(p.duration) + TAIL

  const osc = ctx.createOscillator()
  osc.type = 'sawtooth'
  osc.frequency.setValueAtTime(p.freq, when)
  osc.connect(filter)
  osc.start(when)
  osc.stop(stopAt)

  const sub = ctx.createOscillator()
  sub.type = 'square'
  sub.frequency.setValueAtTime(p.freq / 2, when)
  const subGain = ctx.createGain()
  subGain.gain.value = SUB_LEVEL
  sub.connect(subGain).connect(filter)
  sub.start(when)
  sub.stop(stopAt)

  cleanupAfter(osc, [osc, sub, subGain, filter, amp])
}
