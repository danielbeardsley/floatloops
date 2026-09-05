import { TAIL, clamp, cleanupAfter, percussiveEnvelope } from './env'

/**
 * Cowbell: two detuned square waves through a narrow bandpass. The clash
 * between the two pitches is what gives it the metallic clang.
 */

export type CowbellOptions = {
  decay?: number
  level?: number
}

export const COWBELL_DEFAULTS: Required<CowbellOptions> = {
  decay: 0.35,
  level: 0.45,
}

/** The classic pair of frequencies, in Hz. */
export const COWBELL_FREQS = [540, 800] as const

const BANDPASS_FREQ = 2640

export function resolveCowbellParams(opts: CowbellOptions = {}): Required<CowbellOptions> {
  const d = COWBELL_DEFAULTS
  return {
    decay: clamp(opts.decay ?? d.decay, 0.05, 2, d.decay),
    level: clamp(opts.level ?? d.level, 0, 1, d.level),
  }
}

export function cowbell(
  ctx: BaseAudioContext,
  destination: AudioNode,
  when: number,
  opts: CowbellOptions = {},
): void {
  const p = resolveCowbellParams(opts)

  const bandpass = ctx.createBiquadFilter()
  bandpass.type = 'bandpass'
  bandpass.frequency.value = BANDPASS_FREQ
  bandpass.Q.value = 1.5

  const amp = ctx.createGain()
  percussiveEnvelope(amp.gain, when, p.level, p.decay)

  bandpass.connect(amp).connect(destination)

  const stopAt = when + p.decay + TAIL
  const oscillators = COWBELL_FREQS.map((freq) => {
    const osc = ctx.createOscillator()
    osc.type = 'square'
    osc.frequency.setValueAtTime(freq, when)
    osc.connect(bandpass)
    osc.start(when)
    osc.stop(stopAt)
    return osc
  })

  cleanupAfter(oscillators[0], [...oscillators, bandpass, amp])
}
