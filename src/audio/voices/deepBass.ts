import { LEVEL_FLOOR, TAIL, clamp, cleanupAfter } from './env'

/**
 * Deep Bass: a house bassline. A round sine an octave under the note, with a
 * pair of detuned sawtooths sitting on top of it behind a filter that closes
 * as the note settles.
 *
 * The octave down is what makes it a bass at all: the roll's lowest note is
 * only a C3, which is where a tune lives rather than where a bassline does.
 * Everything written on the roll comes out an octave below what the labels
 * say, so a line drawn along the bottom lands where a house bass belongs.
 *
 * The split between the two layers is the sound. The sine carries the weight
 * and goes straight to the output, so nothing ever thins it out. The
 * sawtooths are cut off below the pitch the roll actually says, which leaves
 * everything underneath to the sine and leaves them doing the one job a sine
 * cannot: on a tablet speaker, which reproduces almost nothing that low, the
 * harmonics they add are the whole reason the note can be heard at all.
 *
 * The lowpass over them -- open for a moment, then closing -- is the
 * difference between a bass note and a held buzz. It closes over a fixed
 * fifth of a second rather than over the note's own length, so a long note
 * settles and stays settled instead of sagging all the way through.
 */

export type DeepBassOptions = {
  freq?: number
  /** How long to hold the note, in seconds, before letting it fall away. */
  duration?: number
  level?: number
}

export const DEEP_BASS_DEFAULTS: Required<DeepBassOptions> = {
  freq: 440,
  duration: 0.25,
  level: 0.5,
}

/** How far under the written note the whole voice plays. */
const OCTAVE_DOWN = 0.5

/** Quick, but not so quick it clicks. A bass note should land, not appear. */
const ATTACK = 0.014
/** Short: house basslines stop between notes, which is where the groove is. */
const RELEASE = 0.14

/** How far apart the two sawtooths sit, in cents. */
const DETUNE_CENTS = 8

/*
 * The two layers, mixed to peak about where the other melody voices do: this
 * is the loudest thing in the kit for its level otherwise, since low notes
 * carry so much more energy than the same level up where the lead sits.
 */
const SUB_LEVEL = 0.36
const BODY_MIX = 0.45

/**
 * Where the sawtooths are trimmed from below, as a multiple of the bass
 * pitch. Two: the octave above it, which is the note as the roll wrote it.
 * Below that is the sine's, and having both there only muddies it.
 */
const BODY_FLOOR = 2
const BODY_FLOOR_Q = 0.7

/** Where the lowpass over them starts and ends, as multiples of the pitch. */
const OPEN = 10
const CLOSED = 4
/** How long it takes to close, whatever the note's own length. */
const SWEEP = 0.2
/** Resonance. Enough to sing as it closes, well short of self-oscillating. */
const FILTER_Q = 2

const MAX_HZ = 16000

/** An interval in cents, as the ratio to multiply a pitch by. */
function cents(value: number): number {
  return Math.pow(2, value / 1200)
}

/** Total time from the start of the note until it has fully died away. */
export function deepBassDuration(duration: number): number {
  return duration + RELEASE
}

export function resolveDeepBassParams(opts: DeepBassOptions = {}): Required<DeepBassOptions> {
  const d = DEEP_BASS_DEFAULTS
  return {
    freq: clamp(opts.freq ?? d.freq, 40, 4000, d.freq),
    // Never shorter than the attack, or the fall would be scheduled before
    // the note had finished arriving.
    duration: clamp(opts.duration ?? d.duration, ATTACK, 8, d.duration),
    level: clamp(opts.level ?? d.level, 0, 1, d.level),
  }
}

export type DeepBassEnvelopePoint = {
  time: number
  value: number
  ramp: 'set' | 'linear' | 'exponential'
}

/**
 * Pure: land, hold, stop. Held apart from the graph so the shape can be
 * checked without Web Audio -- particularly that the note is let go of
 * promptly, since a bass that overlaps the next note turns to mud.
 */
export function deepBassEnvelopePoints(
  when: number,
  level: number,
  duration: number,
): DeepBassEnvelopePoint[] {
  const peak = Math.max(level, LEVEL_FLOOR * 2)
  const releaseAt = when + duration

  return [
    { time: when, value: 0, ramp: 'set' },
    { time: when + ATTACK, value: peak, ramp: 'linear' },
    { time: releaseAt, value: peak, ramp: 'set' },
    { time: releaseAt + RELEASE, value: LEVEL_FLOOR, ramp: 'exponential' },
  ]
}

export function deepBass(
  ctx: BaseAudioContext,
  destination: AudioNode,
  when: number,
  opts: DeepBassOptions = {},
): void {
  const p = resolveDeepBassParams(opts)
  const freq = p.freq * OCTAVE_DOWN
  const stopAt = when + deepBassDuration(p.duration) + TAIL

  const amp = ctx.createGain()
  for (const point of deepBassEnvelopePoints(when, p.level, p.duration)) {
    if (point.ramp === 'set') amp.gain.setValueAtTime(point.value, point.time)
    else if (point.ramp === 'linear') amp.gain.linearRampToValueAtTime(point.value, point.time)
    else amp.gain.exponentialRampToValueAtTime(point.value, point.time)
  }
  amp.connect(destination)

  // The weight. Dead in tune and unfiltered.
  const sub = ctx.createOscillator()
  sub.type = 'sine'
  sub.frequency.setValueAtTime(freq, when)
  const subGain = ctx.createGain()
  subGain.gain.value = SUB_LEVEL
  sub.connect(subGain).connect(amp)
  sub.start(when)
  sub.stop(stopAt)

  const filter = ctx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.Q.value = FILTER_Q
  filter.frequency.setValueAtTime(Math.min(freq * OPEN, MAX_HZ), when)
  // Never longer than the note itself, so a short one still gets to close.
  filter.frequency.exponentialRampToValueAtTime(
    freq * CLOSED,
    when + Math.min(SWEEP, p.duration),
  )
  filter.connect(amp)

  const floor = ctx.createBiquadFilter()
  floor.type = 'highpass'
  floor.Q.value = BODY_FLOOR_Q
  floor.frequency.setValueAtTime(freq * BODY_FLOOR, when)
  floor.connect(filter)

  const body = ctx.createGain()
  body.gain.value = BODY_MIX
  body.connect(floor)

  // Detuned in both directions around the sine rather than away from it: the
  // pair beats against itself for width, while the note itself stays put.
  for (const ratio of [cents(DETUNE_CENTS), cents(-DETUNE_CENTS)]) {
    const osc = ctx.createOscillator()
    osc.type = 'sawtooth'
    osc.frequency.setValueAtTime(freq * ratio, when)
    osc.connect(body)
    osc.start(when)
    osc.stop(stopAt)
    cleanupAfter(osc, [osc])
  }

  cleanupAfter(sub, [sub, subGain, body, floor, filter, amp])
}
