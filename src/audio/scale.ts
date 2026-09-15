/**
 * The melody's pitches: every half-tone from C3 up to B5, low to high.
 *
 * This used to be a pentatonic scale, on the grounds that no combination of
 * its notes can sound wrong together. That is still true, and it is still what
 * a kid poking at the piano roll gets on the first try -- but it is now the
 * roll's *default view* that leaves the clashing notes out rather than the
 * scale itself. The difference is that the notes are still there to be asked
 * for.
 *
 * A pitch is an index into SCALE, and that index is what a saved beat stores,
 * so this array's meaning cannot change without a migration. It changed once,
 * in pattern version 6, when these rows stopped being pentatonic.
 */

export type ScaleNote = {
  /** Shown in the piano roll's row labels. */
  name: string
  freq: number
}

export const PITCHES_PER_OCTAVE = 12

/** MIDI note number of pitch 0. 48 is C3, the bottom of the roll. */
const LOWEST_MIDI = 48
const OCTAVES = 3

/** Sharps rather than flats, because one name per key is enough here. */
const NOTE_NAMES = [
  'C',
  'C#',
  'D',
  'D#',
  'E',
  'F',
  'F#',
  'G',
  'G#',
  'A',
  'A#',
  'B',
] as const

/** Equal temperament, tuned so A4 lands on 440. */
function midiFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12)
}

export const SCALE: readonly ScaleNote[] = Array.from(
  { length: OCTAVES * PITCHES_PER_OCTAVE },
  (_, pitch) => {
    const midi = LOWEST_MIDI + pitch
    return {
      name: `${NOTE_NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`,
      freq: midiFreq(midi),
    }
  },
)

export const PITCH_COUNT = SCALE.length

/** The twelve roots a scale view can be built on, in pitch-class order. */
export const KEYS: readonly string[] = NOTE_NAMES

export function isPitch(pitch: number): boolean {
  return Number.isInteger(pitch) && pitch >= 0 && pitch < PITCH_COUNT
}

function clampPitch(pitch: number): number {
  return Math.min(PITCH_COUNT - 1, Math.max(0, Math.round(pitch)))
}

export function pitchFreq(pitch: number): number {
  return SCALE[clampPitch(pitch)].freq
}

export function pitchName(pitch: number): string {
  return SCALE[clampPitch(pitch)].name
}

/**
 * How far above the key's root this pitch sits, within its octave. Pitch 0 is
 * C, so a key of 0 asks the question about C and the scale views ask it about
 * whichever root they were given.
 */
export function pitchClass(pitch: number, key = 0): number {
  return (((pitch - key) % PITCHES_PER_OCTAVE) + PITCHES_PER_OCTAVE) % PITCHES_PER_OCTAVE
}

/** A black key on a piano. Drawn dimmer, so the octaves stay readable. */
export function isAccidental(pitch: number): boolean {
  return pitchName(pitch).includes('#')
}

/** Degrees of the major scale: seven of them, the eighth being the octave. */
export const MAJOR_DEGREES: readonly number[] = [0, 2, 4, 5, 7, 9, 11]

/** Major pentatonic -- the major scale with the two half-step clashes gone. */
export const PENTATONIC_DEGREES: readonly number[] = [0, 2, 4, 7, 9]

/** Highest first, which is how a piano roll is read. */
export const PITCHES_TOP_DOWN: readonly number[] = SCALE.map((_, i) => PITCH_COUNT - 1 - i)
