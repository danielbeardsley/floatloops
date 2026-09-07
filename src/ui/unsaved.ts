import { useLibraryStore } from '../state/libraryStore'
import { usePatternStore } from '../state/patternStore'
import { useSongStore } from '../state/songStore'
import type { Pattern } from '../state/schema'
import type { Song } from '../state/song'

/**
 * Everything a save would write, in a fixed shape, so two beats can be
 * compared without depending on key order or on how either was built.
 *
 * Deliberately not the whole object. `updatedAt` is stamped by the save
 * itself, so comparing it would call a beat unsaved the instant it was saved
 * -- and comparing timestamps at all is wrong in the other direction too, since
 * an edit in the same millisecond as the save reads as no edit. Note ids and
 * their order are left out for the same reason: dragging a note away and back
 * rebuilds the list, but it is the same music.
 */
function fingerprintPattern(pattern: Pattern): string {
  return JSON.stringify([
    pattern.name,
    pattern.bpm,
    pattern.measures,
    pattern.tracks.map((track) => [track.voiceId, track.level, track.muted, track.steps]),
    pattern.drumsMuted,
    pattern.melody.level,
    pattern.melody.muted,
    pattern.melody.voiceId,
    [...pattern.melody.notes]
      .sort((a, b) => a.start - b.start || a.pitch - b.pitch)
      .map((note) => [note.pitch, note.start, note.length, note.velocity]),
  ])
}

/**
 * Whether a beat has edits the library copy does not have. A beat the library
 * has never heard of counts as unsaved.
 */
export function isUnsaved(pattern: Pattern, saved: Pattern | undefined): boolean {
  return !saved || fingerprintPattern(pattern) !== fingerprintPattern(saved)
}

/**
 * The same for a song. Row and clip ids are left out along with the
 * timestamps: dragging a block away and back gives it a new id without
 * changing the arrangement.
 */
function fingerprintSong(song: Song): string {
  return JSON.stringify([
    song.name,
    song.bpm,
    song.bars,
    song.rows.map((row) => [
      row.patternId,
      row.level,
      row.muted,
      [...row.clips].sort((a, b) => a.start - b.start).map((clip) => [clip.start, clip.length]),
    ]),
  ])
}

export function songIsUnsaved(song: Song, saved: Song | undefined): boolean {
  // A song nobody has put a beat in yet has nothing to lose, and the store
  // always holds one of those before you have opened anything.
  if (!saved) return song.rows.length > 0
  return fingerprintSong(song) !== fingerprintSong(saved)
}

/** The song being arranged, against the library's copy of it. */
export function workingSongIsUnsaved(): boolean {
  const { song } = useSongStore.getState()
  const saved = useLibraryStore.getState().songs.find((item) => item.id === song.id)
  return songIsUnsaved(song, saved)
}

/** The beat on screen, against the library's copy of it. */
export function workingBeatIsUnsaved(): boolean {
  const { pattern } = usePatternStore.getState()
  return isUnsaved(pattern, useLibraryStore.getState().patternsById.get(pattern.id))
}

/**
 * Asks before a reload throws away whatever is in memory.
 *
 * A reload is not a navigation, so it is the one case that has to look at both
 * halves of the app at once: the beat and the arrangement are both held in
 * memory, and both go, whichever screen the button was pressed on. Naming what
 * is at stake matters more here than anywhere else, because the answer is not
 * on screen -- the song is not visible from the beat, or the beat from the
 * song.
 */
export function confirmRefresh(): boolean {
  const atRisk: string[] = []
  if (workingBeatIsUnsaved()) {
    atRisk.push(`the beat "${usePatternStore.getState().pattern.name}"`)
  }
  if (workingSongIsUnsaved()) {
    atRisk.push(`the song "${useSongStore.getState().song.name}"`)
  }
  if (atRisk.length === 0) return true

  const what = atRisk.join(' and ')
  return window.confirm(
    `${what[0].toUpperCase()}${what.slice(1)} ${atRisk.length === 1 ? 'has' : 'have'} ` +
      `changes you have not saved. Refreshing will discard them. Refresh anyway?`,
  )
}

/**
 * Asks before leaving the song screen for the library. Unlike a beat, a song
 * is not merely out of date while it is unsaved -- the library is where it
 * gets replaced, by opening another song or starting a new one, and that is
 * the one place the work actually goes.
 */
export function confirmLeavingSongForLibrary(): boolean {
  if (!workingSongIsUnsaved()) return true
  const { name } = useSongStore.getState().song

  return window.confirm(
    `"${name}" has changes you have not saved. Opening another song will discard them. ` +
      `Go to the library anyway?`,
  )
}

/**
 * Asks at the moment the arrangement would actually be thrown away. The
 * boundary warning above can be walked past, or missed entirely by reaching
 * the library from the beat screen, so this is the one that has to hold.
 */
export function confirmDiscardingSong(what: string): boolean {
  if (!workingSongIsUnsaved()) return true
  const { name } = useSongStore.getState().song

  return window.confirm(`${what} will discard the unsaved changes to "${name}". Carry on?`)
}

/** Whether a song has a row playing a given beat. */
export function patternIsInSong(pattern: Pattern, song: Song): boolean {
  return song.rows.some((row) => row.patternId === pattern.id)
}

/** The same question about whatever is on screen, for the imperative callers. */
export function beatIsInSong(): boolean {
  return patternIsInSong(usePatternStore.getState().pattern, useSongStore.getState().song)
}

/**
 * Asks before going back to a song that would not show the edits. True means
 * carry on.
 *
 * The warning is not that the work is about to be lost -- the sequencer keeps
 * it, and coming back finds it intact. It is that a song row names a *library*
 * beat, so until the save the song goes on playing the last version that was
 * saved, and the edits you just made are simply not in it.
 */
export function confirmLeavingBeatForSong(): boolean {
  const { pattern } = usePatternStore.getState()
  const saved = useLibraryStore.getState().patternsById.get(pattern.id)

  if (!beatIsInSong() || !isUnsaved(pattern, saved)) return true

  return window.confirm(
    `"${pattern.name}" has changes you have not saved. The song will play the last version ` +
      `you saved, not these. Go back to the song anyway?`,
  )
}
