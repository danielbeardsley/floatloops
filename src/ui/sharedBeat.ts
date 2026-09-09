import { create } from 'zustand'
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

export type SharedEditRequest = {
  pattern: Pattern
  /** Every song playing the beat, the open one included. */
  using: Song[]
  /** The song on screen, when it is one of them. */
  inOpen: Song | null
  /** The ones a copy would leave alone. Never empty -- it is why we ask. */
  others: Song[]
}

type SharedEditPrompt = {
  request: SharedEditRequest | null
  answer: ((choice: SharedEdit) => void) | null
  ask: (request: SharedEditRequest) => Promise<SharedEdit>
  choose: (choice: SharedEdit) => void
}

/**
 * The question, waiting for its answer.
 *
 * Two actions, not a yes and a no: "Save" and "Save as a copy" are both saves,
 * and window.confirm can only offer them as OK and Cancel -- which asks the
 * reader to work out which button is the copy. So the save hands the question
 * to the dialog and waits, and the dialog answers with the choice itself.
 */
export const useSharedEditPrompt = create<SharedEditPrompt>()((set, get) => ({
  request: null,
  answer: null,

  ask: (request) =>
    new Promise<SharedEdit>((resolve) => {
      set({ request, answer: resolve })
    }),

  choose: (choice) => {
    const { answer } = get()
    set({ request: null, answer: null })
    answer?.(choice)
  },
}))

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

async function chooseSharedEdit(request: SharedEditRequest): Promise<SharedEdit> {
  // Nothing to weigh when the only song playing the beat is the one on screen:
  // changing it changes exactly what you are looking at.
  if (request.others.length === 0 || answered.has(request.pattern.id)) return 'everywhere'

  answered.add(request.pattern.id)
  return useSharedEditPrompt.getState().ask(request)
}

/**
 * Saves the beat on screen, forking it first if it is shared and that is what
 * was asked for. The one place a beat gets saved, so the question cannot be
 * reached by one route and missed by another.
 *
 * The question waits for the save rather than the edit: the sequencer holds
 * the edits either way, and the save is the half that reaches the songs.
 */
export async function saveWorkingBeat(): Promise<void> {
  const { pattern, setPattern } = usePatternStore.getState()
  const library = useLibraryStore.getState()
  const { song, setRowPattern } = useSongStore.getState()

  const using = songsUsingPattern(pattern.id, library.songs)
  const inOpen = song.rows.some((row) => row.patternId === pattern.id) ? song : null

  const choice = await chooseSharedEdit({
    pattern,
    using,
    inOpen,
    others: using.filter((item) => item.id !== song.id),
  })

  if (choice === 'everywhere') {
    // Keep the saved copy, so saving again updates in place rather than
    // leaving the sequencer holding a stale updatedAt.
    setPattern(await library.save(pattern))
    return
  }

  const copy = await library.duplicate(pattern)
  setPattern(copy)

  // The open song takes the fork; the rest keep the beat they had. Saved
  // rather than left in memory, because the swap is the whole point of having
  // chosen the copy, and a reload would otherwise undo it.
  if (!inOpen) return
  song.rows.forEach((row, index) => {
    if (row.patternId === pattern.id) setRowPattern(index, copy.id)
  })
  await library.saveSong(useSongStore.getState().song)
}
