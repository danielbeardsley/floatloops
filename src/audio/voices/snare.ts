import { TAIL, clamp, cleanupAfter, percussiveEnvelope } from './env'
import { createNoiseSource } from './noise'

/**
 * Snare: filtered noise for the rattle, plus a short triangle tone for the
 * drum body underneath it. The two together are what stop it sounding like a
 * hi-hat.
 */

export type SnareOptions = {
  /** Seconds the noise rattle takes to fade. */
  decay?: number
  /** Pitch of the drum body, in Hz. */
  bodyFreq?: number
  /** How much body is mixed in, 0..1. */
  bodyLevel?: number
  /** Corner frequency of the noise highpass, in Hz. */
  tone?: number
  level?: number
}

export const SNARE_DEFAULTS: Required<SnareOptions> = {
  decay: 0.2,
  bodyFreq: 180,
  bodyLevel: 0.5,
  tone: 1500,
  level: 0.7,
}

export function resolveSnareParams(opts: SnareOptions = {}): Required<SnareOptions> {
  const d = SNARE_DEFAULTS
  return {
    decay: clamp(opts.decay ?? d.decay, 0.02, 2, d.decay),
    bodyFreq: clamp(opts.bodyFreq ?? d.bodyFreq, 40, 1000, d.bodyFreq),
    bodyLevel: clamp(opts.bodyLevel ?? d.bodyLevel, 0, 1, d.bodyLevel),
    tone: clamp(opts.tone ?? d.tone, 200, 12000, d.tone),
    level: clamp(opts.level ?? d.level, 0, 1, d.level),
  }
}

export function snare(
  ctx: BaseAudioContext,
  destination: AudioNode,
  when: number,
  opts: SnareOptions = {},
): void {
  const p = resolveSnareParams(opts)

  const out = ctx.createGain()
  out.gain.value = p.level
  out.connect(destination)

  // Rattle.
  const noise = createNoiseSource(ctx)
  const noiseFilter = ctx.createBiquadFilter()
  noiseFilter.type = 'highpass'
  noiseFilter.frequency.value = p.tone
  const noiseAmp = ctx.createGain()
  percussiveEnvelope(noiseAmp.gain, when, 1, p.decay)
  noise.connect(noiseFilter).connect(noiseAmp).connect(out)

  // Body: shorter than the rattle, so it reads as a thump not a tone.
  const body = ctx.createOscillator()
  body.type = 'triangle'
  body.frequency.setValueAtTime(p.bodyFreq, when)
  const bodyAmp = ctx.createGain()
  percussiveEnvelope(bodyAmp.gain, when, p.bodyLevel, p.decay * 0.5)
  body.connect(bodyAmp).connect(out)

  const stopAt = when + p.decay + TAIL
  noise.start(when)
  noise.stop(stopAt)
  body.start(when)
  body.stop(stopAt)
  cleanupAfter(noise, [noise, noiseFilter, noiseAmp, body, bodyAmp, out])
}
