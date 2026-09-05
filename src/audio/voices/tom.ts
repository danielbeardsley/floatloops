import { TAIL, clamp, cleanupAfter, percussiveEnvelope } from './env'

/**
 * Tom: the same pitch-sweep idea as the kick, but starting closer to its
 * settling pitch so it reads as a tuned drum rather than a thud.
 */

export type TomOptions = {
  /** Pitch the drum settles on, in Hz. */
  freq?: number
  decay?: number
  level?: number
}

export const LOW_TOM_DEFAULTS: Required<TomOptions> = { freq: 100, decay: 0.4, level: 0.6 }
export const HIGH_TOM_DEFAULTS: Required<TomOptions> = { freq: 190, decay: 0.32, level: 0.6 }

/** How far above its settling pitch the sweep begins. */
const SWEEP_RATIO = 1.6

/** Seconds the pitch sweep takes. */
const PITCH_DECAY = 0.08

export function resolveTomParams(
  opts: TomOptions = {},
  defaults: Required<TomOptions> = LOW_TOM_DEFAULTS,
): Required<TomOptions> {
  return {
    freq: clamp(opts.freq ?? defaults.freq, 40, 800, defaults.freq),
    decay: clamp(opts.decay ?? defaults.decay, 0.05, 3, defaults.decay),
    level: clamp(opts.level ?? defaults.level, 0, 1, defaults.level),
  }
}

function playTom(
  ctx: BaseAudioContext,
  destination: AudioNode,
  when: number,
  p: Required<TomOptions>,
): void {
  const osc = ctx.createOscillator()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(p.freq * SWEEP_RATIO, when)
  osc.frequency.exponentialRampToValueAtTime(p.freq, when + PITCH_DECAY)

  const amp = ctx.createGain()
  percussiveEnvelope(amp.gain, when, p.level, p.decay)

  osc.connect(amp).connect(destination)

  osc.start(when)
  osc.stop(when + p.decay + TAIL)
  cleanupAfter(osc, [osc, amp])
}

export function lowTom(
  ctx: BaseAudioContext,
  destination: AudioNode,
  when: number,
  opts: TomOptions = {},
): void {
  playTom(ctx, destination, when, resolveTomParams(opts, LOW_TOM_DEFAULTS))
}

export function highTom(
  ctx: BaseAudioContext,
  destination: AudioNode,
  when: number,
  opts: TomOptions = {},
): void {
  playTom(ctx, destination, when, resolveTomParams(opts, HIGH_TOM_DEFAULTS))
}
