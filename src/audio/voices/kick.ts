import { ATTACK, LEVEL_FLOOR, TAIL, clamp, cleanupAfter, percussiveEnvelope } from './env'

/**
 * Synthesised kick drum: a sine whose pitch drops fast from a click into a
 * body tone, under an exponential amplitude decay. No samples, no assets.
 */

export type KickOptions = {
  /** Pitch the sweep starts at, in Hz. This is the "click". */
  startFreq?: number
  /** Pitch the sweep settles on, in Hz. This is the "body". */
  endFreq?: number
  /** Seconds the pitch sweep takes. */
  pitchDecay?: number
  /** Seconds the amplitude takes to fade out. */
  decay?: number
  /** Peak gain, 0..1. */
  level?: number
}

export const KICK_DEFAULTS: Required<KickOptions> = {
  startFreq: 150,
  endFreq: 45,
  pitchDecay: 0.05,
  decay: 0.4,
  level: 0.9,
}

export { LEVEL_FLOOR }

/**
 * Pure: resolves and clamps options into usable parameters. Kept separate from
 * the node graph so the interesting logic is testable without Web Audio.
 */
export function resolveKickParams(opts: KickOptions = {}): Required<KickOptions> {
  const d = KICK_DEFAULTS
  const startFreq = clamp(opts.startFreq ?? d.startFreq, 20, 2000, d.startFreq)
  // The body must stay below the click, or the sweep runs the wrong way.
  const endFreq = clamp(opts.endFreq ?? d.endFreq, 20, startFreq, d.endFreq)
  return {
    startFreq,
    endFreq,
    pitchDecay: clamp(opts.pitchDecay ?? d.pitchDecay, 0.005, 1, d.pitchDecay),
    decay: clamp(opts.decay ?? d.decay, 0.02, 4, d.decay),
    level: clamp(opts.level ?? d.level, 0, 1, d.level),
  }
}

/**
 * Schedules one kick at `when` (an absolute AudioContext time). Builds a
 * throwaway node graph that disconnects itself when the sound has finished --
 * the normal Web Audio idiom, and cheap enough to do per hit.
 */
export function kick(
  ctx: BaseAudioContext,
  destination: AudioNode,
  when: number,
  opts: KickOptions = {},
): void {
  const p = resolveKickParams(opts)

  const osc = ctx.createOscillator()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(p.startFreq, when)
  osc.frequency.exponentialRampToValueAtTime(p.endFreq, when + p.pitchDecay)

  const amp = ctx.createGain()
  percussiveEnvelope(amp.gain, when, p.level, p.decay, ATTACK)

  osc.connect(amp).connect(destination)

  osc.start(when)
  osc.stop(when + p.decay + TAIL)
  cleanupAfter(osc, [osc, amp])
}
