import { LEVEL_FLOOR, TAIL, clamp, cleanupAfter } from './env'
import { createNoiseSource } from './noise'

/**
 * Sweep: a riser. Noise through a bandpass climbing from low to high, under an
 * envelope that swells instead of decaying.
 *
 * Every other voice in the kit hits and fades. This one is the opposite -- it
 * builds toward the step *after* the one it is placed on, which is what makes
 * it useful for marking the turnaround at the end of a bar.
 */

export type SweepOptions = {
  /** Seconds from the first whisper to the peak. */
  duration?: number
  startFreq?: number
  endFreq?: number
  level?: number
}

export const SWEEP_DEFAULTS: Required<SweepOptions> = {
  duration: 0.6,
  startFreq: 300,
  endFreq: 6000,
  level: 0.35,
}

const FILTER_Q = 2

/** Where in the duration the swell peaks, before dropping away. */
const PEAK_AT = 0.85

export function resolveSweepParams(opts: SweepOptions = {}): Required<SweepOptions> {
  const d = SWEEP_DEFAULTS
  const startFreq = clamp(opts.startFreq ?? d.startFreq, 60, 8000, d.startFreq)
  // The sweep must run upward, or it is a fall rather than a riser.
  const endFreq = clamp(opts.endFreq ?? d.endFreq, startFreq, 16000, d.endFreq)
  return {
    duration: clamp(opts.duration ?? d.duration, 0.1, 4, d.duration),
    startFreq,
    endFreq,
    level: clamp(opts.level ?? d.level, 0, 1, d.level),
  }
}

export type SweepEnvelopePoint = { time: number; value: number }

/**
 * Pure: the swell as scheduled points. Every value stays above zero because
 * the whole shape is exponential -- a linear rise would jump audibly at the
 * start rather than fading in.
 */
export function sweepEnvelopePoints(
  when: number,
  level: number,
  duration: number,
): SweepEnvelopePoint[] {
  const peak = Math.max(level, LEVEL_FLOOR * 2)
  return [
    { time: when, value: LEVEL_FLOOR },
    { time: when + duration * PEAK_AT, value: peak },
    { time: when + duration, value: LEVEL_FLOOR },
  ]
}

export function sweep(
  ctx: BaseAudioContext,
  destination: AudioNode,
  when: number,
  opts: SweepOptions = {},
): void {
  const p = resolveSweepParams(opts)

  const noise = createNoiseSource(ctx)

  const filter = ctx.createBiquadFilter()
  filter.type = 'bandpass'
  filter.Q.value = FILTER_Q
  filter.frequency.setValueAtTime(p.startFreq, when)
  filter.frequency.exponentialRampToValueAtTime(p.endFreq, when + p.duration * PEAK_AT)

  const amp = ctx.createGain()
  const [start, ...rest] = sweepEnvelopePoints(when, p.level, p.duration)
  amp.gain.setValueAtTime(start.value, start.time)
  for (const point of rest) {
    amp.gain.exponentialRampToValueAtTime(point.value, point.time)
  }

  noise.connect(filter).connect(amp).connect(destination)

  noise.start(when)
  noise.stop(when + p.duration + TAIL)
  cleanupAfter(noise, [noise, filter, amp])
}
