import { TAIL, clamp, cleanupAfter, percussiveEnvelope } from './env'

/**
 * Bass: a sawtooth through a resonant lowpass that closes as the note decays.
 * The moving filter is the whole sound -- a saw under a fixed filter is a
 * buzz, while one that darkens as it falls reads as a plucked bass.
 */

export type BassOptions = {
  /** Pitch in Hz. */
  freq?: number
  decay?: number
  /** Where the filter opens to, as a multiple of the pitch. */
  brightness?: number
  level?: number
}

export const BASS_DEFAULTS: Required<BassOptions> = {
  freq: 55,
  decay: 0.35,
  brightness: 8,
  level: 0.7,
}

/** Resonance. High enough to sing at the cutoff, short of self-oscillating. */
const FILTER_Q = 7

/** Where the filter settles, as a multiple of the pitch. */
const CLOSED = 1.5

/** Nothing is ever scheduled above this, to stay clear of the Nyquist limit. */
const MAX_HZ = 16000

export function resolveBassParams(opts: BassOptions = {}): Required<BassOptions> {
  const d = BASS_DEFAULTS
  return {
    freq: clamp(opts.freq ?? d.freq, 20, 600, d.freq),
    decay: clamp(opts.decay ?? d.decay, 0.05, 3, d.decay),
    brightness: clamp(opts.brightness ?? d.brightness, 1.5, 40, d.brightness),
    level: clamp(opts.level ?? d.level, 0, 1, d.level),
  }
}

export function bass(
  ctx: BaseAudioContext,
  destination: AudioNode,
  when: number,
  opts: BassOptions = {},
): void {
  const p = resolveBassParams(opts)

  const osc = ctx.createOscillator()
  osc.type = 'sawtooth'
  osc.frequency.setValueAtTime(p.freq, when)

  const filter = ctx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.Q.value = FILTER_Q
  filter.frequency.setValueAtTime(Math.min(p.freq * p.brightness, MAX_HZ), when)
  filter.frequency.exponentialRampToValueAtTime(p.freq * CLOSED, when + p.decay * 0.6)

  const amp = ctx.createGain()
  percussiveEnvelope(amp.gain, when, p.level, p.decay)

  osc.connect(filter).connect(amp).connect(destination)

  osc.start(when)
  osc.stop(when + p.decay + TAIL)
  cleanupAfter(osc, [osc, filter, amp])
}
