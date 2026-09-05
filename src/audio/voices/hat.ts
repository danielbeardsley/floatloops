import { TAIL, clamp, cleanupAfter, percussiveEnvelope } from './env'
import { createNoiseSource } from './noise'

/**
 * Hi-hat: noise squeezed through a steep highpass. Closed and open are the
 * same voice with different decays, which is exactly how the hardware did it.
 */

export type HatOptions = {
  decay?: number
  /** Corner frequency of the highpass, in Hz. Higher is thinner. */
  tone?: number
  level?: number
}

export const CLOSED_HAT_DEFAULTS: Required<HatOptions> = {
  decay: 0.05,
  tone: 7000,
  level: 0.4,
}

export const OPEN_HAT_DEFAULTS: Required<HatOptions> = {
  decay: 0.3,
  tone: 7000,
  level: 0.35,
}

export function resolveHatParams(
  opts: HatOptions = {},
  defaults: Required<HatOptions> = CLOSED_HAT_DEFAULTS,
): Required<HatOptions> {
  return {
    decay: clamp(opts.decay ?? defaults.decay, 0.01, 2, defaults.decay),
    tone: clamp(opts.tone ?? defaults.tone, 1000, 16000, defaults.tone),
    level: clamp(opts.level ?? defaults.level, 0, 1, defaults.level),
  }
}

function playHat(
  ctx: BaseAudioContext,
  destination: AudioNode,
  when: number,
  p: Required<HatOptions>,
): void {
  const noise = createNoiseSource(ctx)

  const highpass = ctx.createBiquadFilter()
  highpass.type = 'highpass'
  highpass.frequency.value = p.tone

  // A second stage keeps low-mid noise from muddying the top end.
  const bandpass = ctx.createBiquadFilter()
  bandpass.type = 'bandpass'
  bandpass.frequency.value = p.tone * 1.4
  bandpass.Q.value = 0.8

  const amp = ctx.createGain()
  percussiveEnvelope(amp.gain, when, p.level, p.decay)

  noise.connect(highpass).connect(bandpass).connect(amp).connect(destination)

  noise.start(when)
  noise.stop(when + p.decay + TAIL)
  cleanupAfter(noise, [noise, highpass, bandpass, amp])
}

export function closedHat(
  ctx: BaseAudioContext,
  destination: AudioNode,
  when: number,
  opts: HatOptions = {},
): void {
  playHat(ctx, destination, when, resolveHatParams(opts, CLOSED_HAT_DEFAULTS))
}

export function openHat(
  ctx: BaseAudioContext,
  destination: AudioNode,
  when: number,
  opts: HatOptions = {},
): void {
  playHat(ctx, destination, when, resolveHatParams(opts, OPEN_HAT_DEFAULTS))
}
