import { useLibraryStore } from '../state/libraryStore'
import { usePatternStore } from '../state/patternStore'
import { useSongStore } from '../state/songStore'
import type { Pattern } from '../state/schema'
import type { Song } from '../state/song'

/**
 * A song row names a library beat rather than holding one, which is the point:
 * fixing a beat fixes every song that plays it. The cost is that *changing* a
 * beat also changes every song that plays it, and until auto-save that cost
 * was at least paid deliberately, one press of Save at a time.
 *
 * So the beat screen says who else is listening, and the save that would reach
 * them asks first -- offering the thing the warning would otherwise leave you
 * to do by hand, which is to take a copy and leave the songs their version.
 */

/** The songs whose rows name this beat. */
export function songsUsingPattern(patternId: string, songs: readonly Song[]): Song[] {
  return songs.filter((song) => song.rows.some((row) => row.patternId === patternId))
}

/**
 * The notice on the beat screen. Names the song while there is one to name,
 * because "Used in Bath Time" is something you can act on and "Used in 1 song"
 * is a riddle.
 */
export function describeUse(songs: readonly Song[]): string | null {
  if (songs.length === 0) return null
  if (songs.length === 1) return `Used in ${songs[0].name}`
  return `Used in ${songs.length} songs`
}

export type SharedEdit = 'everywhere' | 'copy'

/**
 * Asked once per beat per session. Auto-save means the question would
 * otherwise come round every time the editing paused, and a question that
 * arrives every few seconds is one nobody reads.
 */
const answered = new Set<string>()

/** For tests, and for anything that wants the question asked afresh. */
export function forgetSharedEditAnswers(): void {
  answered.clear()
}

/**
 * Whether to change the shared beat itself or fork it, asked at the moment the
 * change would reach the songs. Editing is not the dangerous half -- the
 * sequencer holds the edits either way -- so the question waits for the save.
 */
export function chooseSharedEdit(pattern: Pattern, using: readonly Song[], inOpen: Song | null): SharedEdit {
  if (using.length === 0 || answered.has(pattern.id)) return 'everywhere'
  answered.add(pattern.id)

  const where =
    using.length === 1 ? `plays in ${using[0].name}` : `plays in ${using.length} songs`
  // Naming the song it would be copied *for* matters more than naming the ones
  // left behind: that is the one the copy lands in, and the one on screen.
  const offer = inOpen
    ? `Make a copy just for ${inOpen.name}? The other songs keep the beat they have.`
    : `Make a copy to edit instead? Your songs keep the beat they have.`

  return window.confirm(`"${pattern.name}" ${where}. Changing it changes all of them.\n\n${offer}`)
    ? 'copy'
    : 'everywhere'
}

/**
 * Saves the beat on screen, forking it first if it is shared and that is what
 * was asked for. The one place a beat gets saved, so the question cannot be
 * reached by one route and missed by another.
 */
export async function saveWorkingBeat(): Promise<void> {
  const { pattern, setPattern } = usePatternStore.getState()
  const library = useLibraryStore.getState()
  const { song, setRowPattern } = useSongStore.getState()

  const using = songsUsingPattern(pattern.id, library.songs)
  const rows = song.rows.filter((row) => row.patternId === pattern.id)

  if (chooseSharedEdit(pattern, using, rows.length > 0 ? song : null) === 'everywhere') {
    // Keep the saved copy, so saving again updates in place rather than
    // leaving the sequencer holding a stale updatedAt.
    setPattern(await library.save(pattern))
    return
  }

  const copy = await library.duplicate(pattern)
  setPattern(copy)

  // The open song takes the fork; the rest keep the beat they had. Saved
  // rather than left in memory, because the swap is the whole point of having
  // chosen the copy, and it is undone by a reload otherwise.
  if (rows.length === 0) return
  song.rows.forEach((row, index) => {
    if (row.patternId === pattern.id) setRowPattern(index, copy.id)
  })
  await library.saveSong(useSongStore.getState().song)
}
