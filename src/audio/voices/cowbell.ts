import { LEVEL_FLOOR, TAIL, clamp, cleanupAfter } from './env'

/**
 * Cowbell: two square waves, deliberately not in a tidy harmonic ratio, rung
 * through a pair of narrow bandpasses.
 *
 * Two things make it read as struck metal rather than a filtered tone. The
 * filters are cascaded, which sharpens the resonance far more than widening a
 * single one would. And the envelope drops sharply before it settles into its
 * tail, which is what a struck object does -- a plain exponential decay sounds
 * like a note being played, not something being hit.
 */

export type CowbellOptions = {
  decay?: number
  /** Centre frequency of the resonance, in Hz. Higher is smaller and tinnier. */
  tone?: number
  level?: number
}

export const COWBELL_DEFAULTS: Required<CowbellOptions> = {
  decay: 0.4,
  tone: 2640,
  level: 0.45,
}

/**
 * The classic pair, in Hz. Their ratio is close to but not exactly 3:2, and
 * that slight wrongness is the clang.
 */
export const COWBELL_FREQS = [540, 800] as const

/** The upper tone sits back a little, so the pair reads as one sound. */
export const COWBELL_MIX = [1, 0.7] as const

/** Resonance of each bandpass stage. Two of these stack into a sharp peak. */
const FILTER_Q = 3

/** Struck, not played: near-instant attack. */
const ATTACK = 0.0005

/** How far the initial clang falls before the tail takes over. */
const BODY_LEVEL = 0.3

export function resolveCowbellParams(opts: CowbellOptions = {}): Required<CowbellOptions> {
  const d = COWBELL_DEFAULTS
  return {
    decay: clamp(opts.decay ?? d.decay, 0.05, 2, d.decay),
    tone: clamp(opts.tone ?? d.tone, 400, 8000, d.tone),
    level: clamp(opts.level ?? d.level, 0, 1, d.level),
  }
}

export type EnvelopePoint = {
  time: number
  value: number
  ramp: 'set' | 'linear' | 'exponential'
}

/**
 * Pure: the two-stage envelope as scheduled points, so its shape can be checked
 * without a Web Audio graph.
 */
export function cowbellEnvelopePoints(
  when: number,
  level: number,
  decay: number,
): EnvelopePoint[] {
  // Kept proportional to the decay so the two stages stay in order even when
  // the cowbell is tuned very short.
  const bodyTime = Math.min(0.03, decay * 0.4)
  const peak = Math.max(level, LEVEL_FLOOR)

  return [
    { time: when, value: 0, ramp: 'set' },
    { time: when + ATTACK, value: peak, ramp: 'linear' },
    { time: when + bodyTime, value: Math.max(peak * BODY_LEVEL, LEVEL_FLOOR), ramp: 'exponential' },
    { time: when + decay, value: LEVEL_FLOOR, ramp: 'exponential' },
  ]
}

export function cowbell(
  ctx: BaseAudioContext,
  destination: AudioNode,
  when: number,
  opts: CowbellOptions = {},
): void {
  const p = resolveCowbellParams(opts)

  const amp = ctx.createGain()
  for (const point of cowbellEnvelopePoints(when, p.level, p.decay)) {
    if (point.ramp === 'set') amp.gain.setValueAtTime(point.value, point.time)
    else if (point.ramp === 'linear') amp.gain.linearRampToValueAtTime(point.value, point.time)
    else amp.gain.exponentialRampToValueAtTime(point.value, point.time)
  }
  amp.connect(destination)

  const stages = [0, 1].map(() => {
    const filter = ctx.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.value = p.tone
    filter.Q.value = FILTER_Q
    return filter
  })
  stages[0].connect(stages[1]).connect(amp)

  const stopAt = when + p.decay + TAIL
  const voices = COWBELL_FREQS.map((freq, i) => {
    const osc = ctx.createOscillator()
    osc.type = 'square'
    osc.frequency.setValueAtTime(freq, when)

    const mix = ctx.createGain()
    mix.gain.value = COWBELL_MIX[i]

    osc.connect(mix).connect(stages[0])
    osc.start(when)
    osc.stop(stopAt)
    return { osc, mix }
  })

  cleanupAfter(voices[0].osc, [
    ...voices.flatMap(({ osc, mix }) => [osc, mix]),
    ...stages,
    amp,
  ])
}
