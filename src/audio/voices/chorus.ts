import { LEVEL_FLOOR, TAIL, clamp, cleanupAfter } from './env'

/**
 * Chorus: three of the same note, very slightly out of tune with each other,
 * swelling in and falling away.
 *
 * The detuning is the sound. Three oscillators in perfect tune are just one
 * louder oscillator; a few cents apart they drift in and out of phase, and
 * that slow beating is what a room full of voices singing the same note
 * actually is. A slow wander on top keeps it from settling into a fixed
 * interference pattern, which would read as a machine rather than a choir.
 *
 * It builds slowly and falls away over a good while after the note ends,
 * which makes it the voice for holding long notes under everything else --
 * short notes barely arrive before they are leaving again.
 */

export type ChorusOptions = {
  freq?: number
  /** How long to hold the note, in seconds, before letting it fall away. */
  duration?: number
  level?: number
}

export const CHORUS_DEFAULTS: Required<ChorusOptions> = {
  freq: 440,
  duration: 0.25,
  level: 0.5,
}

/** The slow build. By far the longest attack of any voice here. */
const ATTACK = 0.18
/** The fall at the end: long enough to hear, short of a wash. */
const RELEASE = 0.35

/** How far apart the outer two voices sit, in cents. */
const DETUNE_CENTS = 7
/** How loud each of the three sits in the blend. */
const VOICE_MIX = 0.4

/** The wander: slow enough to be felt rather than heard as a wobble. */
const DRIFT_HZ = 0.22
/** Its depth, as a fraction of the note's own pitch. */
const DRIFT_DEPTH = 0.0025

/** How far above the note the triangles' edge is trimmed off. */
const BRIGHTNESS = 4
const FILTER_Q = 0.6
const MAX_HZ = 16000

/** An interval in cents, as the ratio to multiply a pitch by. */
function cents(value: number): number {
  return Math.pow(2, value / 1200)
}

/** Total time from the start of the note until it has fully died away. */
export function chorusDuration(duration: number): number {
  return duration + RELEASE
}

export function resolveChorusParams(opts: ChorusOptions = {}): Required<ChorusOptions> {
  const d = CHORUS_DEFAULTS
  return {
    freq: clamp(opts.freq ?? d.freq, 40, 4000, d.freq),
    // Never shorter than the build, or the fall would be scheduled before the
    // note had finished arriving.
    duration: clamp(opts.duration ?? d.duration, ATTACK, 8, d.duration),
    level: clamp(opts.level ?? d.level, 0, 1, d.level),
  }
}

export type ChorusEnvelopePoint = {
  time: number
  value: number
  ramp: 'set' | 'linear' | 'exponential'
}

/**
 * Pure: the build, the hold, the fall. Held apart from the graph so the shape
 * can be checked without Web Audio -- particularly that the fall begins where
 * the note ends rather than eating into it.
 */
export function chorusEnvelopePoints(
  when: number,
  level: number,
  duration: number,
): ChorusEnvelopePoint[] {
  const peak = Math.max(level, LEVEL_FLOOR * 2)
  const releaseAt = when + duration

  return [
    { time: when, value: 0, ramp: 'set' },
    { time: when + ATTACK, value: peak, ramp: 'linear' },
    { time: releaseAt, value: peak, ramp: 'set' },
    { time: releaseAt + RELEASE, value: LEVEL_FLOOR, ramp: 'exponential' },
  ]
}

export function chorus(
  ctx: BaseAudioContext,
  destination: AudioNode,
  when: number,
  opts: ChorusOptions = {},
): void {
  const p = resolveChorusParams(opts)
  const stopAt = when + chorusDuration(p.duration) + TAIL

  const amp = ctx.createGain()
  for (const point of chorusEnvelopePoints(when, p.level, p.duration)) {
    if (point.ramp === 'set') amp.gain.setValueAtTime(point.value, point.time)
    else if (point.ramp === 'linear') amp.gain.linearRampToValueAtTime(point.value, point.time)
    else amp.gain.exponentialRampToValueAtTime(point.value, point.time)
  }
  amp.connect(destination)

  const filter = ctx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.Q.value = FILTER_Q
  filter.frequency.setValueAtTime(Math.min(p.freq * BRIGHTNESS, MAX_HZ), when)
  filter.connect(amp)

  const mix = ctx.createGain()
  mix.gain.value = VOICE_MIX
  mix.connect(filter)

  // The middle voice is dead in tune, so the note itself is never ambiguous:
  // the other two are heard against it rather than against each other.
  const detunes = [1, cents(DETUNE_CENTS), cents(-DETUNE_CENTS)]
  const voices = detunes.map((ratio) => {
    const osc = ctx.createOscillator()
    osc.type = 'triangle'
    osc.frequency.setValueAtTime(p.freq * ratio, when)
    osc.connect(mix)
    osc.start(when)
    osc.stop(stopAt)
    return osc
  })

  // One drift shared by the outer pair, pushing them in opposite directions --
  // the same wander applied to both would move them together and cancel out.
  const drift = ctx.createOscillator()
  drift.type = 'sine'
  drift.frequency.setValueAtTime(DRIFT_HZ, when)
  drift.start(when)
  drift.stop(stopAt)

  const depths = [1, -1].map((direction, i) => {
    const depth = ctx.createGain()
    depth.gain.value = p.freq * DRIFT_DEPTH * direction
    drift.connect(depth)
    depth.connect(voices[i + 1].frequency)
    return depth
  })

  cleanupAfter(voices[0], [...voices, drift, ...depths, mix, filter, amp])
}
