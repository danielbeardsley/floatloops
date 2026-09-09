import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useLibraryStore } from '../../state/libraryStore'
import { usePatternStore } from '../../state/patternStore'
import { useSongStore } from '../../state/songStore'
import { demoPattern, type Pattern } from '../../state/schema'
import { addClip, addRow, createEmptySong, type Song } from '../../state/song'
import { forgetSharedEditAnswers, saveWorkingBeat, songsUsingPattern, describeUse } from '../sharedBeat'

const beat: Pattern = { ...demoPattern(), id: 'boom', name: 'Boom' }

/** A song with one row playing the beat, and one clip in it to preserve. */
function songPlaying(name: string, patternId = 'boom'): Song {
  return addClip(addRow(createEmptySong(name), patternId), 0, { start: 2, length: 3 })
}

let save: ReturnType<typeof vi.fn>
let duplicate: ReturnType<typeof vi.fn>
let saveSong: ReturnType<typeof vi.fn>
let asked: string[]
let answer: boolean
const realConfirm = window.confirm

beforeEach(() => {
  forgetSharedEditAnswers()
  asked = []
  answer = false
  window.confirm = (message?: string) => {
    asked.push(message ?? '')
    return answer
  }

  save = vi.fn(async (pattern: Pattern) => pattern)
  duplicate = vi.fn(async (pattern: Pattern) => ({
    ...pattern,
    id: 'boom-copy',
    name: `${pattern.name} copy`,
  }))
  saveSong = vi.fn(async (song: Song) => song)

  useLibraryStore.setState({ patterns: [], patternsById: new Map(), songs: [], save, duplicate, saveSong })
  usePatternStore.setState({ pattern: beat, preview: null, isPlaying: false })
  useSongStore.setState({ song: createEmptySong(), preview: null, isPlaying: false })
})

afterEach(() => {
  window.confirm = realConfirm
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
    await saveWorkingBeat()

    expect(asked).toHaveLength(0)
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('asks before a change reaches them, naming the beat and the count', async () => {
    useLibraryStore.setState({ songs: [songPlaying('Rocket'), songPlaying('Bath Time')] })

    await saveWorkingBeat()

    expect(asked).toHaveLength(1)
    expect(asked[0]).toContain('"Boom" plays in 2 songs')
    expect(asked[0]).toContain('Changing it changes all of them')
  })

  it('changes the beat itself when that is the answer', async () => {
    useLibraryStore.setState({ songs: [songPlaying('Rocket')] })
    answer = false

    await saveWorkingBeat()

    expect(save).toHaveBeenCalledTimes(1)
    expect(duplicate).not.toHaveBeenCalled()
    expect(usePatternStore.getState().pattern.id).toBe('boom')
  })

  it('forks instead when a copy is asked for, leaving the original saved copy alone', async () => {
    useLibraryStore.setState({ songs: [songPlaying('Rocket')] })
    answer = true

    await saveWorkingBeat()

    expect(duplicate).toHaveBeenCalledTimes(1)
    expect(save).not.toHaveBeenCalled()
    // The sequencer moves to the copy, so the editing carries on into it.
    expect(usePatternStore.getState().pattern.id).toBe('boom-copy')
  })

  // Auto-save would otherwise ask again every time the editing paused.
  it('asks once, however many times the save comes round', async () => {
    useLibraryStore.setState({ songs: [songPlaying('Rocket')] })

    await saveWorkingBeat()
    await saveWorkingBeat()
    await saveWorkingBeat()

    expect(asked).toHaveLength(1)
    expect(save).toHaveBeenCalledTimes(3)
  })
})

describe('a fork made from inside a song', () => {
  beforeEach(() => {
    useLibraryStore.setState({ songs: [songPlaying('Rocket'), songPlaying('Bath Time')] })
    useSongStore.setState({ song: songPlaying('Rocket') })
    answer = true
  })

  it('offers the copy for the song on screen by name', async () => {
    await saveWorkingBeat()
    expect(asked[0]).toContain('Make a copy just for Rocket?')
  })

  it('points the open song at the copy', async () => {
    await saveWorkingBeat()
    expect(useSongStore.getState().song.rows[0].patternId).toBe('boom-copy')
  })

  it('keeps the row playing in the same bars', async () => {
    const before = useSongStore.getState().song.rows[0].clips

    await saveWorkingBeat()

    expect(useSongStore.getState().song.rows[0].clips).toEqual(before)
  })

  // The swap is the whole point of having chosen the copy; a reload would
  // otherwise undo it.
  it('saves the song, so the swap outlives a reload', async () => {
    await saveWorkingBeat()

    expect(saveSong).toHaveBeenCalledTimes(1)
    expect(saveSong.mock.calls[0][0].rows[0].patternId).toBe('boom-copy')
  })

  it('leaves a song that is not open on the beat it had', async () => {
    await saveWorkingBeat()

    const untouched = useLibraryStore.getState().songs.find((s) => s.name === 'Bath Time')
    expect(untouched?.rows[0].patternId).toBe('boom')
  })
})

describe('a fork made from the library', () => {
  it('touches no song at all', async () => {
    useLibraryStore.setState({ songs: [songPlaying('Rocket')] })
    useSongStore.setState({ song: createEmptySong() })
    answer = true

    await saveWorkingBeat()

    expect(asked[0]).toContain('Make a copy to edit instead?')
    expect(saveSong).not.toHaveBeenCalled()
    expect(useSongStore.getState().song.rows).toHaveLength(0)
  })
})
