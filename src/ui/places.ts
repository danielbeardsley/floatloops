import type { Place } from '../state/alignment'

/**
 * How a place in a song is said out loud.
 *
 * The beat editor's ruler goes on counting the beat's own measures from 1,
 * because that is what removing a measure refers to -- so the header is the
 * only thing that can say where in the song those measures are standing, and
 * it has to say it whole. "Bars 5-6" is what lets measure 2 be read as bar 6
 * without the ruler saying so.
 */

export function ordinal(n: number): string {
  const tens = n % 100
  if (tens >= 11 && tens <= 13) return `${n}th`

  switch (n % 10) {
    case 1:
      return `${n}st`
    case 2:
      return `${n}nd`
    case 3:
      return `${n}rd`
    default:
      return `${n}th`
  }
}

/** The song bars this pass stands in, counting from 1 as the song grid does. */
export function barsLabel(place: Place): string {
  const first = place.bar + 1
  const last = place.bar + place.bars
  return first === last ? `bar ${first}` : `bars ${first}–${last}`
}

/** Which time through it is. Only worth saying when the beat plays more than once. */
export function timeLabel(place: Place): string {
  return `${ordinal(place.time)} time it plays`
}
