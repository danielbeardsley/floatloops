import { TAIL, clamp, cleanupAfter, percussiveEnvelope } from './env'

/**
 * Bells: two sine partials struck together and left to ring.
 *
 * The partial sits at 2.76x the fundamental rather than a whole multiple,
 * which is the whole trick -- two tones deliberately out of harmony read as
 * struck metal, where any whole multiple would just read as a brighter organ.
 *
 * A bell goes on ringing after the finger comes up, so the note's length sets
 * how long it rings rather than cutting it off.
 */

export type BellsOptions = {
  freq?: number
  /** How long the note is held, in seconds. The ring outlasts it. */
  duration?: number
  level?: number
}

export const BELLS_DEFAULTS: Required<BellsOptions> = {
  freq: 440,
  duration: 0.25,
  level: 0.4,
}

const PARTIAL = 2.76
/** How loud the partial rings against the fundamental. */
const PARTIAL_LEVEL = 0.45
/** How long the bell rings on past the end of the note. */
const RING = 0.5
/** The strike itself. Slower than a drum's, or the sines click. */
const ATTACK = 0.004

/** Total time from the start of the note until the bell has died away. */
export function bellsDuration(duration: number): number {
  return duration + RING
}

export function resolveBellsParams(opts: BellsOptions = {}): Required<BellsOptions> {
  const d = BELLS_DEFAULTS
  return {
    freq: clamp(opts.freq ?? d.freq, 40, 4000, d.freq),
    duration: clamp(opts.duration ?? d.duration, 0.05, 8, d.duration),
    level: clamp(opts.level ?? d.level, 0, 1, d.level),
  }
}

export function bells(
  ctx: BaseAudioContext,
  destination: AudioNode,
  when: number,
  opts: BellsOptions = {},
): void {
  const p = resolveBellsParams(opts)
  const ring = bellsDuration(p.duration)
  const stopAt = when + ring + TAIL

  const amp = ctx.createGain()
  percussiveEnvelope(amp.gain, when, p.level, ring, ATTACK)
  amp.connect(destination)

  const osc = ctx.createOscillator()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(p.freq, when)
  osc.connect(amp)
  osc.start(when)
  osc.stop(stopAt)

  // The shimmer belongs to the strike, so the partial dies well before the
  // fundamental does -- holding both for the same time sounds like a siren.
  const partial = ctx.createOscillator()
  partial.type = 'sine'
  partial.frequency.setValueAtTime(p.freq * PARTIAL, when)
  const partialGain = ctx.createGain()
  percussiveEnvelope(partialGain.gain, when, PARTIAL_LEVEL, ring * 0.55, ATTACK)
  partial.connect(partialGain).connect(amp)
  partial.start(when)
  partial.stop(stopAt)

  cleanupAfter(osc, [osc, partial, partialGain, amp])
}
