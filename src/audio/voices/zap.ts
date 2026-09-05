import { TAIL, clamp, cleanupAfter, percussiveEnvelope } from './env'

/**
 * Zap: a sawtooth falling off a cliff. Same idea as the kick's pitch sweep,
 * but from far higher and across a far wider range, which turns a thump into
 * an arcade laser.
 */

export type ZapOptions = {
  startFreq?: number
  endFreq?: number
  decay?: number
  level?: number
}

export const ZAP_DEFAULTS: Required<ZapOptions> = {
  startFreq: 1800,
  endFreq: 80,
  decay: 0.18,
  level: 0.4,
}

/** The sweep finishes before the sound does, so it lands rather than trails. */
const SWEEP_FRACTION = 0.8

export function resolveZapParams(opts: ZapOptions = {}): Required<ZapOptions> {
  const d = ZAP_DEFAULTS
  const startFreq = clamp(opts.startFreq ?? d.startFreq, 100, 12000, d.startFreq)
  // The sweep must run downward, or it is a different sound entirely.
  const endFreq = clamp(opts.endFreq ?? d.endFreq, 30, startFreq, d.endFreq)
  return {
    startFreq,
    endFreq,
    decay: clamp(opts.decay ?? d.decay, 0.03, 2, d.decay),
    level: clamp(opts.level ?? d.level, 0, 1, d.level),
  }
}

export function zap(
  ctx: BaseAudioContext,
  destination: AudioNode,
  when: number,
  opts: ZapOptions = {},
): void {
  const p = resolveZapParams(opts)

  const osc = ctx.createOscillator()
  osc.type = 'sawtooth'
  osc.frequency.setValueAtTime(p.startFreq, when)
  osc.frequency.exponentialRampToValueAtTime(p.endFreq, when + p.decay * SWEEP_FRACTION)

  const amp = ctx.createGain()
  percussiveEnvelope(amp.gain, when, p.level, p.decay)

  osc.connect(amp).connect(destination)

  osc.start(when)
  osc.stop(when + p.decay + TAIL)
  cleanupAfter(osc, [osc, amp])
}
