import { LEVEL_FLOOR, TAIL, clamp, cleanupAfter } from './env'

/**
 * Deep Bass: a growling club bassline. A sine an octave under the note, bent
 * by a second sine, driven through a soft clip.
 *
 * The octave down is what makes it a bass at all: the roll's lowest note is
 * only a C3, which is where a tune lives rather than where a bassline does.
 * Everything written on the roll comes out an octave below what the labels
 * say, so a line drawn along the bottom lands where a house bass belongs.
 *
 * The harmonics are *made* here rather than filtered out of a sawtooth, which
 * is the whole difference between this and an ordinary synth bass. A second
 * oscillator -- heard by nothing, connected only to the first one's pitch --
 * pushes that pitch up and down thousands of times a second. Too fast to hear
 * as a wobble, it is heard instead as new tones above the note, and how far it
 * pushes decides how many. So the brightness has its own envelope: a hard bite
 * at the front of every note that settles back within a tenth of a second,
 * which a filter sweep can only imitate by taking harmonics away.
 *
 * What that buys is a bass that stays audible on a tablet. A filtered
 * sawtooth's harmonics are only ever what survived the filter, so a deep
 * setting leaves almost nothing up where a small speaker works. These
 * harmonics are generated at whatever strength the note needs, with the
 * fundamental underneath left as a clean sine for anything that can reproduce
 * it.
 *
 * The modulator sits an octave above the carrier, so everything it makes falls
 * on the note's own harmonic series: hollow and square-ish rather than
 * clangorous. Push the ratio off a whole number and it turns to bell metal,
 * which is worth hearing once on the bench and is not a bassline.
 *
 * On top of that a slow wobble moves the brightness a few times a second. It
 * starts fresh with each note rather than running underneath the music, so it
 * reads as the way this bass speaks rather than as an effect wandering in and
 * out of time with the beat.
 *
 * Last comes a soft clip for grit and a lowpass to keep the sidebands from
 * fizzing -- fixed, not swept: with the bite where it is, a moving filter
 * would only be a second opinion about the same moment.
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
  /**
   * Where the modulator sits, as a multiple of the pitch. Whole numbers give
   * harmonics of the note; anything between them gives tones that belong to no
   * note at all, which is a bell rather than a bass.
   */
  ratio: number
  /**
   * How hard the note is bent as it lands, in modulation index -- roughly, how
   * many harmonics the bite reaches up to. This is the attack of the sound.
   *
   * Not a knob that turns evenly: how much of the note is left at its own
   * pitch rises and falls as this goes up, and there is a hole around 4 where
   * almost none of it is. The bench finds these in a few seconds and they are
   * why the settings below are the numbers they are.
   */
  growl: number
  /** And what it settles back to, which is the timbre of the held note. */
  body: number
  /** How long the bite takes to fall back to the body. */
  bite: number
  /** The wobble under the brightness, in wobbles per second. */
  wobble: number
  /** How far it moves, as a fraction of the body. 0 holds the note still. */
  wobbleDepth: number
  /** Lid on the sidebands, as a multiple of the pitch. Low is dull, not deep. */
  tone: number
  /** Resonance at that lid. A little sharpens the top of the growl. */
  q: number
  /**
   * How hard the signal is pushed into the clip. Higher is dirtier: 1 is
   * barely bent, and past about 6 the note is a square with a pitch.
   */
  drive: number
  /**
   * How loud the voice runs for a given level. Under 1 because a bass note
   * carries far more energy than the same level up where the lead sits, and
   * lower again than a clean one would need: squaring off the peaks raises how
   * loud the note reads without raising the peak itself.
   */
  level: number
}

export const DEEP_BASS_TUNING: DeepBassTuning = {
  octave: 0.5,
  attack: 0.01,
  decay: 3.4,
  release: 0.06,
  ratio: 2,
  growl: 5,
  body: 1.4,
  bite: 0.12,
  wobble: 5.5,
  wobbleDepth: 0.3,
  tone: 9,
  q: 1,
  drive: 3,
  level: 0.4,
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
  const d = DEEP_BASS_TUNING
  return {
    octave: clamp(t.octave, 0.125, 2, d.octave),
    attack: clamp(t.attack, 0.001, 0.5, d.attack),
    decay: clamp(t.decay, 0.05, 20, d.decay),
    release: clamp(t.release, 0.01, 2, d.release),
    ratio: clamp(t.ratio, 0.25, 12, d.ratio),
    growl: clamp(t.growl, 0.01, 24, d.growl),
    // Never zero: the bite falls to it along an exponential ramp, which cannot
    // reach nothing, and a held note with no harmonics at all is a test tone.
    body: clamp(t.body, 0.01, 24, d.body),
    bite: clamp(t.bite, 0.005, 2, d.bite),
    wobble: clamp(t.wobble, 0, 40, d.wobble),
    wobbleDepth: clamp(t.wobbleDepth, 0, 2, d.wobbleDepth),
    tone: clamp(t.tone, 1, 64, d.tone),
    q: clamp(t.q, 0.0001, 20, d.q),
    drive: clamp(t.drive, 0.01, 20, d.drive),
    level: clamp(t.level, 0, 1, d.level),
  }
}

/**
 * A soft clip, as the curve a WaveShaper reads: tanh bends the loud parts of
 * the wave towards flat while leaving the quiet parts nearly alone, so the
 * note gains harmonics rather than simply being chopped. Normalised by its own
 * ceiling, so turning the drive up adds dirt without adding volume.
 *
 * Symmetric, which means it can only ever add odd harmonics -- with the
 * modulator an octave up, which is also odd-only, the note has no octave in it
 * at all. A lopsided curve would put one there, and the bench says it is not
 * worth having: sliding the bend off centre by a third cost a third of the
 * fundamental and left a DC offset behind to buy a second harmonic a
 * twentieth the size of the note. The hollow, odd-harmonic bass is the sound.
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

/**
 * How far the modulator pushes the carrier's pitch, in Hz, for a given index.
 * The index is the musical number -- it says how far up the harmonics reach,
 * whatever the note -- and this is what a Web Audio gain has to be set to in
 * order to deliver it.
 */
export function deviationHz(index: number, modulatorHz: number): number {
  return index * modulatorHz
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

  // Fixed, not swept. It is here to stop the top of the growl fizzing, and the
  // note's movement is already accounted for by the bite.
  const lid = ctx.createBiquadFilter()
  lid.type = 'lowpass'
  lid.Q.setValueAtTime(t.q, when)
  lid.frequency.setValueAtTime(Math.min(freq * t.tone, MAX_HZ), when)
  lid.connect(amp)

  const dirt = ctx.createWaveShaper()
  dirt.curve = curveFor(t.drive)
  // A clipped, modulated sine reaches well past where the samples can carry
  // it, and without this those harmonics fold back down as a whistle.
  dirt.oversample = '4x'
  dirt.connect(lid)

  const carrier = ctx.createOscillator()
  carrier.type = 'sine'
  carrier.frequency.setValueAtTime(freq, when)
  carrier.connect(dirt)
  carrier.start(when)
  carrier.stop(stopAt)

  const modulatorHz = freq * t.ratio

  /*
   * The bite. This gain is what the modulation index actually is: the
   * modulator leaves it at full scale, and how much of it arrives at the
   * carrier's pitch is the whole timbre of the note.
   */
  const index = ctx.createGain()
  index.gain.setValueAtTime(deviationHz(t.growl, modulatorHz), when)
  index.gain.exponentialRampToValueAtTime(
    deviationHz(t.body, modulatorHz),
    // Never longer than the note itself, so a short one still gets to settle.
    when + Math.min(t.bite, p.duration),
  )
  index.connect(carrier.frequency)

  const modulator = ctx.createOscillator()
  modulator.type = 'sine'
  modulator.frequency.setValueAtTime(modulatorHz, when)
  modulator.connect(index)
  modulator.start(when)
  modulator.stop(stopAt)

  // The wobble rides on top of whatever the bite is doing: an audio-rate
  // param sums what is scheduled on it with what is connected into it, so
  // these two are heard as one line moving rather than as two effects.
  const wobble = ctx.createOscillator()
  wobble.type = 'sine'
  wobble.frequency.setValueAtTime(t.wobble, when)
  const wobbleDepth = ctx.createGain()
  wobbleDepth.gain.value = deviationHz(t.body * t.wobbleDepth, modulatorHz)
  wobble.connect(wobbleDepth).connect(index.gain)
  wobble.start(when)
  wobble.stop(stopAt)

  cleanupAfter(carrier, [
    carrier,
    modulator,
    index,
    wobble,
    wobbleDepth,
    dirt,
    lid,
    amp,
  ])
}
