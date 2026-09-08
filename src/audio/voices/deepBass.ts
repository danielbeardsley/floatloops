import { LEVEL_FLOOR, TAIL, clamp, cleanupAfter } from './env'

/**
 * Deep Bass: a club bassline. One sawtooth an octave under the note, behind a
 * resonant lowpass that opens for an instant and then shuts down onto the
 * fundamental, driven through a soft clip.
 *
 * The octave down is what makes it a bass at all: the roll's lowest note is
 * only a C3, which is where a tune lives rather than where a bassline does.
 * Everything written on the roll comes out an octave below what the labels
 * say, so a line drawn along the bottom lands where a house bass belongs.
 *
 * The filter sweep is most of the sound. A sawtooth is all harmonics, and left
 * alone at this pitch it is a buzz; dropping the cutoff from well above the
 * note to just above it, quickly, throws away that buzz but keeps the moment
 * of it at the front of every note. That moment is the punch, and it is also
 * what a tablet speaker can actually reproduce -- the fundamental down here is
 * felt more than heard. The resonance is what makes the drop sing rather than
 * merely happen.
 *
 * The sweep runs over a fixed time rather than over the note's own length, so
 * a long note settles and stays settled instead of sagging all the way
 * through.
 *
 * Then it is driven through a soft clip, which is where the dirt comes from.
 * The saturation sits *after* the filter rather than before it, which is the
 * whole trick: it makes new harmonics out of whatever the filter left behind,
 * so a note stays gritty after the cutoff has shut, instead of the sweep
 * taking the grit away with it. Clipping also flattens the peaks, which is
 * what lets the voice sound big without the level to match.
 *
 * Every number behind all of that is in DEEP_BASS_TUNING, and a caller may
 * pass a `tuning` of its own to override any of them. Nothing in the app does
 * -- the point is that the bench at lab/deep-bass.html can turn them while a
 * riff is playing, so the sound can be dialled in by ear rather than by
 * editing a constant and reloading.
 */

/**
 * The sound itself, as numbers. Ratios where a value has to hold up across the
 * roll's range, seconds where it is a time, and everything named for what it
 * does rather than what it multiplies.
 */
export type DeepBassTuning = {
  /** How far under the written note the whole voice plays. 0.5 is an octave. */
  octave: number
  /** Quick, but not so quick it clicks. A bass note should land, not appear. */
  attack: number
  /**
   * How long the note would take to fade out entirely while held. Far longer
   * than any note it will be given, so in practice a held note only sags.
   */
  decay: number
  /** Short: house basslines stop between notes, which is where the groove is. */
  release: number
  /** Where the lowpass starts, as a multiple of the pitch being played. */
  open: number
  /** And where it ends. Under about 1 and the note itself is filtered away. */
  closed: number
  /** How long it takes to close, whatever the note's own length. */
  sweep: number
  /** Resonance. Enough to sing as it closes, well short of self-oscillating. */
  q: number
  /**
   * How hard the signal is pushed into the clip. Higher is dirtier: 1 is
   * barely bent, and past about 6 it is a square with a pitch rather than a
   * bass.
   */
  drive: number
  /**
   * How loud the voice runs for a given level. Under 1 because a sawtooth this
   * low carries far more energy than the same level up where the lead sits,
   * and lower again than an unclipped one would need: squaring off the peaks
   * raises how loud the note reads without raising the peak itself.
   */
  level: number
}

export const DEEP_BASS_TUNING: DeepBassTuning = {
  octave: 0.5,
  attack: 0.01,
  decay: 3.4,
  release: 0.06,
  open: 9,
  closed: 1.6,
  sweep: 0.15,
  q: 4,
  drive: 4,
  level: 0.45,
}

export type DeepBassOptions = {
  freq?: number
  /** How long to hold the note, in seconds, before letting it fall away. */
  duration?: number
  level?: number
  /** Overrides for any of the numbers the sound is made of. */
  tuning?: Partial<DeepBassTuning>
}

export const DEEP_BASS_DEFAULTS: Required<Omit<DeepBassOptions, 'tuning'>> = {
  freq: 440,
  duration: 0.25,
  level: 0.5,
}

/** Points in the shaping curve. Enough that the bend is smooth, not stepped. */
const CURVE_POINTS = 1024

const MAX_HZ = 16000

export function resolveDeepBassTuning(tuning: Partial<DeepBassTuning> = {}): DeepBassTuning {
  const t = { ...DEEP_BASS_TUNING, ...tuning }
  return {
    octave: clamp(t.octave, 0.125, 2, DEEP_BASS_TUNING.octave),
    attack: clamp(t.attack, 0.001, 0.5, DEEP_BASS_TUNING.attack),
    decay: clamp(t.decay, 0.05, 20, DEEP_BASS_TUNING.decay),
    release: clamp(t.release, 0.01, 2, DEEP_BASS_TUNING.release),
    open: clamp(t.open, 1, 64, DEEP_BASS_TUNING.open),
    closed: clamp(t.closed, 0.5, 64, DEEP_BASS_TUNING.closed),
    sweep: clamp(t.sweep, 0.005, 2, DEEP_BASS_TUNING.sweep),
    q: clamp(t.q, 0.0001, 20, DEEP_BASS_TUNING.q),
    drive: clamp(t.drive, 0.01, 20, DEEP_BASS_TUNING.drive),
    level: clamp(t.level, 0, 1, DEEP_BASS_TUNING.level),
  }
}

/**
 * A soft clip, as the curve a WaveShaper reads: tanh bends the loud parts of
 * the wave towards flat while leaving the quiet parts nearly alone, so the
 * note gains harmonics rather than simply being chopped. Normalised by its own
 * ceiling, so turning the drive up adds dirt without adding volume.
 */
export function saturationCurve(drive: number): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(CURVE_POINTS)
  const ceiling = Math.tanh(drive)
  for (let i = 0; i < CURVE_POINTS; i += 1) {
    const x = (i * 2) / (CURVE_POINTS - 1) - 1
    curve[i] = Math.tanh(drive * x) / ceiling
  }
  return curve
}

/**
 * Curves are identical for a given drive and cost a thousand tanh calls to
 * build, so they are kept rather than rebuilt per note. The bench turns the
 * drive knob through a few dozen values at most, so this stays small.
 */
const curves = new Map<number, Float32Array<ArrayBuffer>>()

function curveFor(drive: number): Float32Array<ArrayBuffer> {
  let curve = curves.get(drive)
  if (!curve) {
    curve = saturationCurve(drive)
    curves.set(drive, curve)
  }
  return curve
}

/** Total time from the start of the note until it has fully died away. */
export function deepBassDuration(duration: number, tuning?: Partial<DeepBassTuning>): number {
  return duration + resolveDeepBassTuning(tuning).release
}

export function resolveDeepBassParams(
  opts: DeepBassOptions = {},
): Required<Omit<DeepBassOptions, 'tuning'>> {
  const d = DEEP_BASS_DEFAULTS
  const t = resolveDeepBassTuning(opts.tuning)
  return {
    freq: clamp(opts.freq ?? d.freq, 40, 4000, d.freq),
    // Never shorter than the attack, or the fall would be scheduled before
    // the note had finished arriving.
    duration: clamp(opts.duration ?? d.duration, t.attack, 8, d.duration),
    level: clamp(opts.level ?? d.level, 0, 1, d.level),
  }
}

export type DeepBassEnvelopePoint = {
  time: number
  value: number
  ramp: 'set' | 'linear' | 'exponential'
}

/**
 * Pure: land, sag, stop. Held apart from the graph so the shape can be
 * checked without Web Audio -- particularly that the note is let go of
 * promptly, since a bass that overlaps the next note turns to mud.
 */
export function deepBassEnvelopePoints(
  when: number,
  level: number,
  duration: number,
  tuning?: Partial<DeepBassTuning>,
): DeepBassEnvelopePoint[] {
  const t = resolveDeepBassTuning(tuning)
  const peak = Math.max(level * t.level, LEVEL_FLOOR * 2)
  const releaseAt = when + duration
  const held = Math.max(duration - t.attack, 0)
  const sagged = Math.max(peak * (1 - Math.min(held / t.decay, 1)), LEVEL_FLOOR * 2)

  return [
    { time: when, value: 0, ramp: 'set' },
    { time: when + t.attack, value: peak, ramp: 'linear' },
    { time: releaseAt, value: sagged, ramp: 'linear' },
    { time: releaseAt + t.release, value: LEVEL_FLOOR, ramp: 'exponential' },
  ]
}

export function deepBass(
  ctx: BaseAudioContext,
  destination: AudioNode,
  when: number,
  opts: DeepBassOptions = {},
): void {
  const t = resolveDeepBassTuning(opts.tuning)
  const p = resolveDeepBassParams(opts)
  const freq = p.freq * t.octave
  const stopAt = when + deepBassDuration(p.duration, t) + TAIL

  const amp = ctx.createGain()
  for (const point of deepBassEnvelopePoints(when, p.level, p.duration, t)) {
    if (point.ramp === 'set') amp.gain.setValueAtTime(point.value, point.time)
    else if (point.ramp === 'linear') amp.gain.linearRampToValueAtTime(point.value, point.time)
    else amp.gain.exponentialRampToValueAtTime(point.value, point.time)
  }
  amp.connect(destination)

  const filter = ctx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.Q.setValueAtTime(t.q, when)
  filter.frequency.setValueAtTime(Math.min(freq * t.open, MAX_HZ), when)
  // Never longer than the note itself, so a short one still gets to close.
  filter.frequency.exponentialRampToValueAtTime(
    Math.min(freq * t.closed, MAX_HZ),
    when + Math.min(t.sweep, p.duration),
  )

  // Post-filter, so the grit outlives the sweep. 4x oversampling because a
  // clipped sawtooth makes harmonics well past where the samples can carry
  // them, and without it those fold back down as a whistle over the note.
  const dirt = ctx.createWaveShaper()
  dirt.curve = curveFor(t.drive)
  dirt.oversample = '4x'
  dirt.connect(amp)
  filter.connect(dirt)

  const osc = ctx.createOscillator()
  osc.type = 'sawtooth'
  osc.frequency.setValueAtTime(freq, when)
  osc.connect(filter)
  osc.start(when)
  osc.stop(stopAt)

  cleanupAfter(osc, [osc, filter, dirt, amp])
}
