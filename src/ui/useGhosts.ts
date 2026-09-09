import { useMemo } from 'react'
import { ghostsAt, placeNear, placesFor, type GhostSource, type Place } from '../state/alignment'
import { useLibraryStore } from '../state/libraryStore'
import { usePatternStore } from '../state/patternStore'
import { useSettingsStore } from '../state/settingsStore'
import { useSongStore } from '../state/songStore'
import { totalSteps } from '../state/schema'
import { songBeingEditedFor } from './unsaved'
import { mergeGhosts, type GhostMarks } from './ghostMarks'

export type PlaceInSong = {
  /** The pass being edited. */
  place: Place
  /** Every pass in the song, so one can be stepped to from another. */
  places: Place[]
}

/**
 * Where in the song the beat on screen is being edited.
 *
 * Only for a beat opened *from* a song: the song store holds whatever was last
 * arranged, so a beat opened from the library is often in one by coincidence,
 * and a place nobody navigated to is not a place. A bar in the middle of a
 * pass resolves to that pass, and no bar at all to the first one.
 */
export function usePlace(): PlaceInSong | null {
  const pattern = usePatternStore((s) => s.pattern)
  const fromSong = usePatternStore((s) => s.fromSong)
  const atBar = usePatternStore((s) => s.atBar)
  const song = useSongStore((s) => s.song)

  const inSong = songBeingEditedFor(pattern, song, fromSong) !== null

  // Keyed on the beat's length rather than the beat, so drawing a step does
  // not recompute where in the song it stands.
  const places = useMemo(
    () => (inSong ? placesFor(song, pattern.id, pattern.measures) : []),
    [inSong, song, pattern.id, pattern.measures],
  )

  const place = useMemo(() => placeNear(places, atBar ?? 0), [places, atBar])

  return place ? { place, places } : null
}

export type Ghosts = PlaceInSong & {
  /** The other rows sounding here, in the song's row order. */
  sources: GhostSource[]
  /** What to draw in the cells, the hidden rows already taken out. */
  marks: GhostMarks
  /**
   * How many of the beat's steps play at this place. Past that the clip has
   * run out: nothing of yours sounds there, so nothing lines up with it.
   */
  playedSteps: number
}

/**
 * What the rest of the song is doing against the beat on screen, or null when
 * there is nothing to show -- no place, or the switch is off.
 */
export function useGhosts(): Ghosts | null {
  const here = usePlace()
  const pattern = usePatternStore((s) => s.pattern)
  const hidden = usePatternStore((s) => s.hiddenOthers)
  const song = useSongStore((s) => s.song)
  const patternsById = useLibraryStore((s) => s.patternsById)
  const showOthers = useSettingsStore((s) => s.showOthers)

  const place = here?.place ?? null
  const steps = totalSteps(pattern)

  const ghosts = useMemo(
    () =>
      place && showOthers
        ? ghostsAt(song, patternsById, pattern.id, place, steps)
        : null,
    [place, showOthers, song, patternsById, pattern.id, steps],
  )

  const marks = useMemo(
    () => (ghosts ? mergeGhosts(ghosts.sources, new Set(hidden)) : null),
    [ghosts, hidden],
  )

  if (!here || !ghosts || !marks) return null
  return { ...here, sources: ghosts.sources, marks, playedSteps: ghosts.playedSteps }
}
