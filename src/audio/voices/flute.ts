import { LEVEL_FLOOR, TAIL, clamp, cleanupAfter } from './env'

/**
 * Flute: a soft triangle that breathes in rather than being struck.
 *
 * The slow attack is the sound. Every other voice here starts in a couple of
 * milliseconds; this one takes long enough that a short note never quite
 * arrives, which is exactly how a flute behaves and why holding notes out is
 * worth doing.
 *
 * The vibrato is small on purpose: enough to stop the tone sounding like a
 * test tone, not enough to be heard as a wobble.
 */

export type FluteOptions = {
  freq?: number
  /** How long to hold the note, in seconds, before releasing. */
  duration?: number
  level?: number
}

export const FLUTE_DEFAULTS: Required<FluteOptions> = {
  freq: 440,
  duration: 0.25,
  level: 0.5,
}

const ATTACK = 0.07
const RELEASE = 0.1

/** How far above the note the triangle's edge is trimmed off. */
const BRIGHTNESS = 3
const FILTER_Q = 0.7
const MAX_HZ = 16000

const VIBRATO_HZ = 5.2
/** Vibrato depth, as a fraction of the note's own pitch. */
const VIBRATO_DEPTH = 0.006

/** Total time from the start of the note until it has fully died away. */
export function fluteDuration(duration: number): number {
  return duration + RELEASE
}

export function resolveFluteParams(opts: FluteOptions = {}): Required<FluteOptions> {
  const d = FLUTE_DEFAULTS
  return {
    freq: clamp(opts.freq ?? d.freq, 40, 4000, d.freq),
    // Never shorter than the breath in, or the release would be scheduled
    // before the note had reached full level.
    duration: clamp(opts.duration ?? d.duration, ATTACK, 8, d.duration),
    level: clamp(opts.level ?? d.level, 0, 1, d.level),
  }
}

export type FluteEnvelopePoint = {
  time: number
  value: number
  ramp: 'set' | 'linear' | 'exponential'
}

/**
 * Pure: breath in, hold, breath out. Held separately from the graph so the
 * shape can be checked without Web Audio -- particularly that a note reaches
 * full level before it is let go of.
 */
export function fluteEnvelopePoints(
  when: number,
  level: number,
  duration: number,
): FluteEnvelopePoint[] {
  const peak = Math.max(level, LEVEL_FLOOR * 2)
  const releaseAt = when + duration

  return [
    { time: when, value: 0, ramp: 'set' },
    { time: when + ATTACK, value: peak, ramp: 'linear' },
    { time: releaseAt, value: peak, ramp: 'set' },
    { time: releaseAt + RELEASE, value: LEVEL_FLOOR, ramp: 'exponential' },
  ]
}

export function flute(
  ctx: BaseAudioContext,
  destination: AudioNode,
  when: number,
  opts: FluteOptions = {},
): void {
  const p = resolveFluteParams(opts)
  const stopAt = when + fluteDuration(p.duration) + TAIL

  const amp = ctx.createGain()
  for (const point of fluteEnvelopePoints(when, p.level, p.duration)) {
    if (point.ramp === 'set') amp.gain.setValueAtTime(point.value, point.time)
    else if (point.ramp === 'linear') amp.gain.linearRampToValueAtTime(point.value, point.time)
    else amp.gain.exponentialRampToValueAtTime(point.value, point.time)
  }
  amp.connect(destination)

  const filter = ctx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.Q.value = FILTER_Q
  filter.frequency.setValueAtTime(Math.min(p.freq * BRIGHTNESS, MAX_HZ), when)
  filter.connect(amp)

  const osc = ctx.createOscillator()
  osc.type = 'triangle'
  osc.frequency.setValueAtTime(p.freq, when)
  osc.connect(filter)
  osc.start(when)
  osc.stop(stopAt)

  // The vibrato is a second oscillator pushing the first one's pitch about,
  // rather than a scheduled wobble, so it stays even however long the note is.
  const lfo = ctx.createOscillator()
  lfo.type = 'sine'
  lfo.frequency.setValueAtTime(VIBRATO_HZ, when)
  const lfoDepth = ctx.createGain()
  lfoDepth.gain.setValueAtTime(p.freq * VIBRATO_DEPTH, when)
  lfo.connect(lfoDepth)
  lfoDepth.connect(osc.frequency)
  lfo.start(when)
  lfo.stop(stopAt)

  cleanupAfter(osc, [osc, lfo, lfoDepth, filter, amp])
}
