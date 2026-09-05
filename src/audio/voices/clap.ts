import { LEVEL_FLOOR, TAIL, clamp, cleanupAfter } from './env'
import { createNoiseSource } from './noise'

/**
 * Clap: several very short noise bursts a few milliseconds apart, then a
 * longer tail. The stutter is the whole trick -- a single burst just sounds
 * like a snare with no body.
 */

export type ClapOptions = {
  /** Seconds the final tail takes to fade. */
  decay?: number
  /** Centre frequency of the bandpass, in Hz. */
  tone?: number
  level?: number
}

export const CLAP_DEFAULTS: Required<ClapOptions> = {
  decay: 0.25,
  tone: 1000,
  level: 0.6,
}

/** Offsets, in seconds, of the short bursts that precede the tail. */
const BURSTS = [0, 0.011, 0.022]

/**
 * How long each individual burst lasts. Must stay shorter than the gap between
 * bursts, or their envelope points interleave and arrive out of order.
 */
const BURST_DECAY = 0.009

export function resolveClapParams(opts: ClapOptions = {}): Required<ClapOptions> {
  const d = CLAP_DEFAULTS
  return {
    decay: clamp(opts.decay ?? d.decay, 0.05, 2, d.decay),
    tone: clamp(opts.tone ?? d.tone, 200, 8000, d.tone),
    level: clamp(opts.level ?? d.level, 0, 1, d.level),
  }
}

/**
 * Pure: the gain envelope as a list of scheduled points, so the burst timing
 * can be checked without a Web Audio graph.
 */
export function clapEnvelopePoints(
  when: number,
  level: number,
  decay: number,
): Array<{ time: number; value: number; ramp: 'set' | 'linear' | 'exponential' }> {
  const points: Array<{ time: number; value: number; ramp: 'set' | 'linear' | 'exponential' }> = []

  for (const offset of BURSTS) {
    const start = when + offset
    points.push({ time: start, value: 0, ramp: 'set' })
    points.push({ time: start + 0.001, value: level, ramp: 'linear' })
    points.push({ time: start + BURST_DECAY, value: LEVEL_FLOOR, ramp: 'exponential' })
  }

  const tailStart = when + BURSTS[BURSTS.length - 1] + BURST_DECAY
  points.push({ time: tailStart, value: level * 0.7, ramp: 'linear' })
  points.push({ time: tailStart + decay, value: LEVEL_FLOOR, ramp: 'exponential' })

  return points
}

/** Total time from `when` until the clap has fully died away. */
export function clapDuration(decay: number): number {
  return BURSTS[BURSTS.length - 1] + BURST_DECAY + decay
}

export function clap(
  ctx: BaseAudioContext,
  destination: AudioNode,
  when: number,
  opts: ClapOptions = {},
): void {
  const p = resolveClapParams(opts)

  const noise = createNoiseSource(ctx)

  const bandpass = ctx.createBiquadFilter()
  bandpass.type = 'bandpass'
  bandpass.frequency.value = p.tone
  bandpass.Q.value = 1.2

  const amp = ctx.createGain()
  for (const point of clapEnvelopePoints(when, p.level, p.decay)) {
    if (point.ramp === 'set') amp.gain.setValueAtTime(point.value, point.time)
    else if (point.ramp === 'linear') amp.gain.linearRampToValueAtTime(point.value, point.time)
    else amp.gain.exponentialRampToValueAtTime(point.value, point.time)
  }

  noise.connect(bandpass).connect(amp).connect(destination)

  noise.start(when)
  noise.stop(when + clapDuration(p.decay) + TAIL)
  cleanupAfter(noise, [noise, bandpass, amp])
}
