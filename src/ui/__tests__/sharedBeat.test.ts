import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useLibraryStore } from '../../state/libraryStore'
import { usePatternStore } from '../../state/patternStore'
import { useSongStore } from '../../state/songStore'
import { demoPattern, type Pattern } from '../../state/schema'
import { addClip, addRow, createEmptySong, type Song } from '../../state/song'
import {
  forgetSharedEditAnswers,
  saveWorkingBeat,
  songsUsingPattern,
  describeUse,
  useSharedEditPrompt,
  type SharedEdit,
  type SharedEditRequest,
} from '../sharedBeat'

const beat: Pattern = { ...demoPattern(), id: 'boom', name: 'Boom' }

/** A song with one row playing the beat, and one clip in it to preserve. */
function songPlaying(name: string, patternId = 'boom'): Song {
  return addClip(addRow(createEmptySong(name), patternId), 0, { start: 2, length: 3 })
}

let save: ReturnType<typeof vi.fn>
let duplicate: ReturnType<typeof vi.fn>
let saveSong: ReturnType<typeof vi.fn>
let asked: SharedEditRequest[]
let answer: SharedEdit

/**
 * Runs a save through to the end, answering the question if one is asked.
 * The request is on the store the moment the save is called, since it goes up
 * synchronously before the save has anything to await.
 */
async function saveAndAnswer(): Promise<void> {
  const saving = saveWorkingBeat()
  const { request, choose } = useSharedEditPrompt.getState()
  if (request) {
    asked.push(request)
    choose(answer)
  }
  await saving
}

beforeEach(() => {
  forgetSharedEditAnswers()
  useSharedEditPrompt.setState({ request: null, answer: null })
  asked = []
  answer = 'everywhere'

  save = vi.fn(async (pattern: Pattern) => pattern)
  duplicate = vi.fn(async (pattern: Pattern) => ({
    ...pattern,
    id: 'boom-copy',
    name: `${pattern.name} copy`,
  }))
  saveSong = vi.fn(async (song: Song) => song)

  useLibraryStore.setState({ patterns: [], patternsById: new Map(), songs: [], save, duplicate, saveSong })
  usePatternStore.setState({ pattern: beat, preview: null, isPlaying: false, fromSong: null })
  useSongStore.setState({ song: createEmptySong(), preview: null, isPlaying: false })
})

describe('who is playing a beat', () => {
  it('finds the songs whose rows name it', () => {
    const songs = [songPlaying('Rocket'), createEmptySong('Empty'), songPlaying('Bath Time')]
    expect(songsUsingPattern('boom', songs).map((s) => s.name)).toEqual(['Rocket', 'Bath Time'])
  })

  it('says nothing when nothing plays it', () => {
    expect(describeUse([])).toBeNull()
  })

  // "Used in 1 song" is a riddle; the name is something you can act on.
  it('names the song while there is one to name', () => {
    expect(describeUse([songPlaying('Rocket')])).toBe('Used in Rocket')
  })

  it('counts them once there are several', () => {
    expect(describeUse([songPlaying('Rocket'), songPlaying('Bath Time')])).toBe('Used in 2 songs')
  })
})

describe('saving a beat other songs play', () => {
  it('saves without asking when no song plays it', async () => {
    await saveAndAnswer()

    expect(asked).toHaveLength(0)
    expect(save).toHaveBeenCalledTimes(1)
  })

  // Changing it changes exactly what is on screen, which is what was asked
  // for. Asking would be a question with nothing behind it.
  it('does not ask when the only song playing it is the one on screen', async () => {
    const rocket = songPlaying('Rocket')
    useLibraryStore.setState({ songs: [rocket] })
    useSongStore.setState({ song: rocket })
    usePatternStore.setState({ fromSong: rocket.id })

    await saveAndAnswer()

    expect(asked).toHaveLength(0)
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('asks before a change reaches them, naming the beat and the songs', async () => {
    useLibraryStore.setState({ songs: [songPlaying('Rocket'), songPlaying('Bath Time')] })

    await saveAndAnswer()

    expect(asked).toHaveLength(1)
    expect(asked[0].pattern.name).toBe('Boom')
    expect(asked[0].using.map((song) => song.name)).toEqual(['Rocket', 'Bath Time'])
    expect(asked[0].others).toHaveLength(2)
  })

  it('changes the beat itself when that is the answer', async () => {
    useLibraryStore.setState({ songs: [songPlaying('Rocket')] })
    answer = 'everywhere'

    await saveAndAnswer()

    expect(save).toHaveBeenCalledTimes(1)
    expect(duplicate).not.toHaveBeenCalled()
    expect(usePatternStore.getState().pattern.id).toBe('boom')
  })

  it('forks instead when a copy is asked for, leaving the original saved copy alone', async () => {
    useLibraryStore.setState({ songs: [songPlaying('Rocket')] })
    answer = 'copy'

    await saveAndAnswer()

    expect(duplicate).toHaveBeenCalledTimes(1)
    expect(save).not.toHaveBeenCalled()
    // The sequencer moves to the copy, so the editing carries on into it.
    expect(usePatternStore.getState().pattern.id).toBe('boom-copy')
  })

  // Auto-save would otherwise ask again every time the editing paused.
  it('asks once, however many times the save comes round', async () => {
    useLibraryStore.setState({ songs: [songPlaying('Rocket')] })

    await saveAndAnswer()
    await saveAndAnswer()
    await saveAndAnswer()

    expect(asked).toHaveLength(1)
    expect(save).toHaveBeenCalledTimes(3)
  })
})

describe('a fork made from inside a song', () => {
  beforeEach(() => {
    // The same Rocket in the library and on screen, as a real trip in gives.
    const rocket = songPlaying('Rocket')
    useLibraryStore.setState({ songs: [rocket, songPlaying('Bath Time')] })
    useSongStore.setState({ song: rocket })
    usePatternStore.setState({ fromSong: rocket.id })
    answer = 'copy'
  })

  it('offers the copy for the song on screen', async () => {
    await saveAndAnswer()
    expect(asked[0].inOpen?.name).toBe('Rocket')
  })

  it('points the open song at the copy', async () => {
    await saveAndAnswer()
    expect(useSongStore.getState().song.rows[0].patternId).toBe('boom-copy')
  })

  it('keeps the row playing in the same bars', async () => {
    const before = useSongStore.getState().song.rows[0].clips

    await saveAndAnswer()

    expect(useSongStore.getState().song.rows[0].clips).toEqual(before)
  })

  // The swap is the whole point of having chosen the copy; a reload would
  // otherwise undo it.
  it('saves the song, so the swap outlives a reload', async () => {
    await saveAndAnswer()

    expect(saveSong).toHaveBeenCalledTimes(1)
    expect(saveSong.mock.calls[0][0].rows[0].patternId).toBe('boom-copy')
  })

  it('leaves a song that is not open on the beat it had', async () => {
    await saveAndAnswer()

    const untouched = useLibraryStore.getState().songs.find((s) => s.name === 'Bath Time')
    expect(untouched?.rows[0].patternId).toBe('boom')
  })
})

describe('a fork made from the library', () => {
  it('touches no song at all', async () => {
    useLibraryStore.setState({ songs: [songPlaying('Rocket')] })
    useSongStore.setState({ song: createEmptySong() })
    answer = 'copy'

    await saveAndAnswer()

    expect(asked[0].inOpen).toBeNull()
    expect(saveSong).not.toHaveBeenCalled()
    expect(useSongStore.getState().song.rows).toHaveLength(0)
  })
})


/**
 * The song store holds whatever was last arranged, so a beat opened from the
 * library is often in it by coincidence. That must not make the song a
 * context: the fork would rearrange, and save, a song nobody opened.
 */
describe('a beat opened from the library while a song is loaded', () => {
  let rocket: Song

  beforeEach(() => {
    rocket = songPlaying('Rocket')
    useLibraryStore.setState({ songs: [rocket] })
    useSongStore.setState({ song: rocket })
    // The library route leaves this clear; only a trip in from the song sets it.
    usePatternStore.setState({ fromSong: null })
    answer = 'copy'
  })

  it('still asks, since the change would reach a song out of sight', async () => {
    await saveAndAnswer()
    expect(asked).toHaveLength(1)
  })

  it('offers a new beat rather than a copy for that song', async () => {
    await saveAndAnswer()
    expect(asked[0].inOpen).toBeNull()
    expect(asked[0].others.map((song) => song.name)).toEqual(['Rocket'])
  })

  it('leaves the loaded song rows alone', async () => {
    await saveAndAnswer()
    expect(useSongStore.getState().song.rows[0].patternId).toBe('boom')
  })

  it('does not save a song nobody opened', async () => {
    await saveAndAnswer()
    expect(saveSong).not.toHaveBeenCalled()
  })
})
