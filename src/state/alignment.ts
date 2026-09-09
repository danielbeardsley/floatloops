import { STEPS_PER_MEASURE } from '../audio/timing'
import { PITCH_COUNT } from '../audio/scale'
import { clipAt, type Song, type SongRow } from './song'
import type { Pattern } from './schema'

/**
 * Where a beat sits in a song, and what else is sounding there.
 *
 * A beat edited on its own has no such question: its first step is its first
 * step. Inside a song it plays in bars, alongside other rows, and a hit that
 * fills a gap in one place lands on top of a bassline in another -- so the
 * only way to line beats up is to say *which place* is being edited.
 *
 * Everything here is pure step arithmetic over the saved song. It knows
 * nothing about tempo, because it does not need to: bars are sixteen steps
 * whatever the clock says, so two beats line up the same at any speed.
 */

/**
 * One occasion in the song where the beat starts a pass of itself.
 *
 * A pass rather than a bar, because a beat loops inside its clip: a two-bar
 * beat across eight bars is four passes, and each one is a separate place to
 * be editing at. Anchoring to a bar in the middle of a pass would show the
 * beat's second bar under the heading of its first.
 */
export type Place = {
  /** Song bar the pass begins on. */
  bar: number
  /** Which time through the beat this is, counting every pass from 1. */
  time: number
  /**
   * How many of the beat's own bars this pass gets. Short of the whole beat
   * when the clip runs out inside it -- the striped tail the song grid draws.
   */
  bars: number
}

/** One other row of the song, as it lines up against the beat being edited. */
export type GhostSource = {
  rowId: string
  patternId: string
  /**
   * The song has this row switched off. It is still a source: a muted row is
   * part of the arrangement being written around, so it is for the screen to
   * draw it fainter rather than for this to drop it.
   */
  muted: boolean
  /** Per track of the kit, the velocity landing on each step of *your* beat. */
  drums: number[][]
  /** Per pitch, whether this row is sounding it on each step of *your* beat. */
  notes: boolean[][]
}

export type Ghosts = {
  /** Every other row sounding during the pass, in the song's row order. */
  sources: GhostSource[]
  /**
   * How many of your beat's steps actually play at this place. Less than the
   * whole beat where the clip is cut short, and nothing lines up past that
   * point because nothing of yours is sounding there.
   */
  playedSteps: number
}

/**
 * Every place the beat plays, in bar order.
 *
 * The same beat may be on more than one row, so passes are gathered across
 * all of them and then sorted -- "the 3rd time it plays" is a fact about the
 * song, not about a row. Two rows starting the same beat on the same bar are
 * one place, since they are the same sixteen steps twice over.
 */
export function placesFor(song: Song, patternId: string, measures: number): Place[] {
  const width = Math.max(1, Math.floor(measures))
  const bars = new Map<number, number>()

  for (const row of song.rows) {
    if (row.patternId !== patternId) continue
    for (const clip of row.clips) {
      const end = clip.start + clip.length
      for (let bar = clip.start; bar < end; bar += width) {
        bars.set(bar, Math.max(bars.get(bar) ?? 0, Math.min(width, end - bar)))
      }
    }
  }

  return [...bars.entries()]
    .sort(([a], [b]) => a - b)
    .map(([bar, covered], index) => ({ bar, time: index + 1, bars: covered }))
}

/**
 * The place a song bar belongs to: the pass covering it, or failing that the
 * nearest one.
 *
 * The fallback is what keeps an anchor alive through an edit. Adding a
 * measure to the beat re-cuts every pass underneath it, and a bar that was a
 * place a moment ago may now be the middle of one or outside the clip
 * entirely -- which should move you to the nearest real place, not throw the
 * context away.
 */
export function placeNear(places: readonly Place[], bar: number): Place | undefined {
  const covering = places.find((place) => bar >= place.bar && bar < place.bar + place.bars)
  if (covering) return covering

  return places.reduce<Place | undefined>((best, place) => {
    if (!best) return place
    return Math.abs(place.bar - bar) < Math.abs(best.bar - bar) ? place : best
  }, undefined)
}

/** Copies one bar of a neighbour's beat into the step space of yours. */
function addBar(source: GhostSource, pattern: Pattern, theirBar: number, yourBar: number): void {
  const from = theirBar * STEPS_PER_MEASURE
  const shift = yourBar * STEPS_PER_MEASURE - from

  if (!pattern.drumsMuted) {
    pattern.tracks.forEach((track, trackIndex) => {
      // A track its own beat has muted makes no sound here, and a ghost of
      // silence is a lie about what you are lining up with.
      if (track.muted) return
      for (let i = 0; i < STEPS_PER_MEASURE; i += 1) {
        source.drums[trackIndex][yourBar * STEPS_PER_MEASURE + i] = track.steps[from + i] ?? 0
      }
    })
  }

  if (pattern.melody.muted) return

  // Walking the notes rather than the cells, and clipping each to this bar:
  // a note held across the neighbour's own loop point is cut exactly where
  // the loop cuts it, which is what you hear.
  for (const note of pattern.melody.notes) {
    const start = Math.max(note.start, from)
    const end = Math.min(note.start + note.length, from + STEPS_PER_MEASURE)
    for (let step = start; step < end; step += 1) {
      source.notes[note.pitch][step + shift] = true
    }
  }
}

/**
 * What the rest of the song plays against one pass of the beat being edited.
 *
 * The result is in *your* beat's step space -- step 5 of a ghost is step 5 of
 * the grid on screen -- so drawing it needs no further arithmetic. Rows
 * playing the same beat are left out: that is you, somewhere else in the
 * song, and drawing your own hits as someone else's would be a nonsense.
 *
 * Hiding a source is the screen's business, not this one's: it returns every
 * row that is there, and what to draw of them is a choice made after.
 */
export function ghostsAt(
  song: Song,
  patterns: ReadonlyMap<string, Pattern>,
  patternId: string,
  place: Place,
  steps: number,
): Ghosts {
  const playedSteps = Math.min(steps, place.bars * STEPS_PER_MEASURE)
  const sources: GhostSource[] = []

  for (const row of song.rows) {
    if (row.patternId === patternId) continue

    const pattern = patterns.get(row.patternId)
    if (!pattern) continue

    const source = blankSource(row, steps, pattern.tracks.length)
    let sounds = false

    for (let bar = 0; bar < place.bars; bar += 1) {
      const songBar = place.bar + bar
      const clip = clipAt(row, songBar)
      if (!clip) continue

      sounds = true
      addBar(source, pattern, (songBar - clip.start) % pattern.measures, bar)
    }

    if (sounds) sources.push(source)
  }

  return { sources, playedSteps }
}

function blankSource(row: SongRow, steps: number, tracks: number): GhostSource {
  return {
    rowId: row.id,
    patternId: row.patternId,
    muted: row.muted,
    drums: Array.from({ length: tracks }, () => new Array<number>(steps).fill(0)),
    notes: Array.from({ length: PITCH_COUNT }, () => new Array<boolean>(steps).fill(false)),
  }
}

/**
 * A stamp of what lines up here, so two places can be compared.
 *
 * The passes of a beat usually look identical -- everything is one, two or
 * four bars and the clips start on even bars -- and where they do, there is
 * nothing to choose between them and no reason to offer the choice. It is the
 * odd song where the third time through lands differently, and that is
 * precisely the thing the arranger cannot see and needs telling about.
 */
export function alignmentKey(ghosts: Ghosts): string {
  const rows = ghosts.sources.map((source) => {
    const drums = source.drums.map((track) => track.join('')).join('|')
    const notes = source.notes.map((pitch) => pitch.map((on) => (on ? 1 : 0)).join('')).join('|')
    return `${source.patternId}:${drums}:${notes}`
  })

  return `${ghosts.playedSteps};${rows.join(';')}`
}
