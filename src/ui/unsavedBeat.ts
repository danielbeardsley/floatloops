import { useLibraryStore } from '../state/libraryStore'
import { usePatternStore } from '../state/patternStore'
import { useSongStore } from '../state/songStore'
import type { Pattern } from '../state/schema'

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
function fingerprint(pattern: Pattern): string {
  return JSON.stringify([
    pattern.name,
    pattern.bpm,
    pattern.measures,
    pattern.tracks.map((track) => [track.voiceId, track.level, track.muted, track.steps]),
    pattern.melody.level,
    pattern.melody.muted,
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
  return !saved || fingerprint(pattern) !== fingerprint(saved)
}

/** Whether the song being arranged has a row playing the beat in the sequencer. */
export function beatIsInSong(): boolean {
  const { pattern } = usePatternStore.getState()
  return useSongStore.getState().song.rows.some((row) => row.patternId === pattern.id)
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
