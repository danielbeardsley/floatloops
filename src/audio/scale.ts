/**
 * The melody's pitches: A minor pentatonic, low to high.
 *
 * A pentatonic scale has no semitone clashes, so no combination of these notes
 * can sound wrong together. That is the whole reason for choosing it -- a kid
 * poking at the piano roll should get something musical on the first try.
 */

export type ScaleNote = {
  /** Shown in the piano roll's row labels. */
  name: string
  freq: number
}

export const SCALE: readonly ScaleNote[] = [
  { name: 'A3', freq: 220.0 },
  { name: 'C4', freq: 261.63 },
  { name: 'D4', freq: 293.66 },
  { name: 'E4', freq: 329.63 },
  { name: 'G4', freq: 392.0 },
  { name: 'A4', freq: 440.0 },
  { name: 'C5', freq: 523.25 },
  { name: 'D5', freq: 587.33 },
] as const

export const PITCH_COUNT = SCALE.length

export function isPitch(pitch: number): boolean {
  return Number.isInteger(pitch) && pitch >= 0 && pitch < PITCH_COUNT
}

export function pitchFreq(pitch: number): number {
  return SCALE[Math.min(PITCH_COUNT - 1, Math.max(0, Math.round(pitch)))].freq
}

export function pitchName(pitch: number): string {
  return SCALE[Math.min(PITCH_COUNT - 1, Math.max(0, Math.round(pitch)))].name
}

/** Highest first, which is how a piano roll is read. */
export const PITCHES_TOP_DOWN: readonly number[] = SCALE.map((_, i) => PITCH_COUNT - 1 - i)
