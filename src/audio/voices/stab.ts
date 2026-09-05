import { TAIL, clamp, cleanupAfter, percussiveEnvelope } from './env'

/**
 * Stab: a minor triad of sawtooths, slightly detuned against each other, under
 * a filter that snaps shut. The detuning is what stops three saws sounding
 * like one loud saw.
 */

export type StabOptions = {
  /** Root pitch in Hz. */
  freq?: number
  decay?: number
  level?: number
}

export const STAB_DEFAULTS: Required<StabOptions> = {
  freq: 220,
  decay: 0.28,
  level: 0.45,
}

/** Root, minor third, fifth. */
export const STAB_INTERVALS = [1, 1.2, 1.5] as const

/** Pulled apart by a few cents each, so the three voices beat gently. */
export const STAB_DETUNE = [1, 1.004, 0.996] as const

const FILTER_Q = 3
const OPEN = 14
const CLOSED = 3
const MAX_HZ = 16000

export function resolveStabParams(opts: StabOptions = {}): Required<StabOptions> {
  const d = STAB_DEFAULTS
  return {
    freq: clamp(opts.freq ?? d.freq, 50, 2000, d.freq),
    decay: clamp(opts.decay ?? d.decay, 0.05, 2, d.decay),
    level: clamp(opts.level ?? d.level, 0, 1, d.level),
  }
}

export function stab(
  ctx: BaseAudioContext,
  destination: AudioNode,
  when: number,
  opts: StabOptions = {},
): void {
  const p = resolveStabParams(opts)

  const amp = ctx.createGain()
  percussiveEnvelope(amp.gain, when, p.level, p.decay)
  amp.connect(destination)

  const filter = ctx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.Q.value = FILTER_Q
  filter.frequency.setValueAtTime(Math.min(p.freq * OPEN, MAX_HZ), when)
  filter.frequency.exponentialRampToValueAtTime(p.freq * CLOSED, when + p.decay * 0.5)
  filter.connect(amp)

  const stopAt = when + p.decay + TAIL
  const oscillators = STAB_INTERVALS.map((interval, i) => {
    const osc = ctx.createOscillator()
    osc.type = 'sawtooth'
    osc.frequency.setValueAtTime(p.freq * interval * STAB_DETUNE[i], when)
    osc.connect(filter)
    osc.start(when)
    osc.stop(stopAt)
    return osc
  })

  cleanupAfter(oscillators[0], [...oscillators, filter, amp])
}
