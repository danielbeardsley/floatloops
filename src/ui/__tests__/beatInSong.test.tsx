import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { BeatInSong } from '../BeatInSong'
import { Nav } from '../App'
import { usePatternStore } from '../../state/patternStore'
import { useSongStore } from '../../state/songStore'
import { useLibraryStore } from '../../state/libraryStore'
import {
  addNote,
  createEmptyPattern,
  removeNote,
  toggleStep,
  type Pattern,
} from '../../state/schema'
import { isUnsaved } from '../unsaved'
import { addClip, addRow, createEmptySong } from '../../state/song'

const navigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => navigate }
})

/** Stands in for the real store's save, which also refreshes the lookup. */
const save = vi.fn(async (pattern: Pattern) => {
  const saved: Pattern = { ...pattern, updatedAt: pattern.updatedAt + 1 }
  useLibraryStore.setState({ patterns: [saved], patternsById: new Map([[saved.id, saved]]) })
  return saved
})

/**
 * The beat as the library has it, and the same beat open in the sequencer.
 *
 * `openedFromSong` is how the trip in is expressed: it defaults to matching
 * `inSong`, since arriving from the song is the ordinary way to be editing a
 * beat the song plays, but the two come apart when the library is the route.
 */
type SetUp = {
  inSong?: boolean
  edited?: boolean
  openedFromSong?: boolean
  /** Bars the beat is arranged over, and which bar the trip in aimed at. */
  clip?: { start: number; length: number }
  atBar?: number | null
  measures?: number
}

function setUp({
  inSong = true,
  edited = false,
  openedFromSong = inSong,
  clip,
  atBar = null,
  measures = 1,
}: SetUp = {}) {
  const saved: Pattern = { ...createEmptyPattern('Boom Bap', measures), id: 'boom' }
  const working = edited ? toggleStep(saved, 0, 0) : saved

  useLibraryStore.setState({
    patterns: [saved],
    patternsById: new Map([[saved.id, saved]]),
    songs: [],
    loading: false,
    error: null,
    save,
  })
  let song = addRow(createEmptySong('Opener'), inSong ? saved.id : 'some-other-beat')
  if (clip) song = addClip(song, 0, clip)
  useSongStore.setState({ song, preview: null, isPlaying: false })
  usePatternStore.setState({
    pattern: working,
    preview: null,
    isPlaying: false,
    fromSong: openedFromSong ? song.id : null,
    atBar,
  })

  return { saved, working, song }
}

function show() {
  return render(
    <MemoryRouter>
      <BeatInSong />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  navigate.mockClear()
  save.mockClear()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('the way back to a song', () => {
  it('stays out of the way for a beat no song is using', () => {
    setUp({ inSong: false })
    show()
    expect(screen.queryByText(/In the song/)).not.toBeInTheDocument()
  })

  /*
   * The song store holds whatever was last arranged, so the open song often
   * plays the beat you reached from the library. That is a fact about the
   * beat, not a place you were: offering a way "back" would send you somewhere
   * you had never been, and Save & back would file the edit as a trip you
   * never made.
   */
  it('stays out of the way for a beat reached from the library', () => {
    setUp({ inSong: true, openedFromSong: false })
    show()
    expect(screen.queryByText(/in the song/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /back to song/i })).not.toBeInTheDocument()
  })

  // The row can go while the beat is still open, and the bar goes with it.
  it('stays out of the way once the song stops playing the beat', () => {
    const { song } = setUp({ inSong: false, openedFromSong: true })
    usePatternStore.setState({ fromSong: song.id })
    show()
    expect(screen.queryByText(/in the song/i)).not.toBeInTheDocument()
  })

  it('names the song the beat belongs to', () => {
    setUp()
    show()
    expect(screen.getByText('Opener')).toBeInTheDocument()
  })

  it('offers one plain way back when there is nothing to save', () => {
    setUp()
    show()
    expect(screen.getByRole('button', { name: 'Back to song' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Save/ })).not.toBeInTheDocument()
  })

  it('goes back without a word when there is nothing to save', () => {
    setUp()
    const confirm = vi.fn(() => true)
    vi.stubGlobal('confirm', confirm)
    show()

    fireEvent.click(screen.getByRole('button', { name: 'Back to song' }))
    expect(confirm).not.toHaveBeenCalled()
    expect(navigate).toHaveBeenCalledWith('/song')
  })
})

describe('a beat edited since its last save', () => {
  it('says the song is still playing the saved version', () => {
    setUp({ edited: true })
    show()
    expect(screen.getByText(/plays the last version you saved/)).toBeInTheDocument()
  })

  it('makes saving and returning one button', async () => {
    setUp({ edited: true })
    show()

    fireEvent.click(screen.getByRole('button', { name: 'Save & back to song' }))
    await act(async () => {})

    expect(save).toHaveBeenCalledOnce()
    expect(save.mock.calls[0][0].id).toBe('boom')
    expect(navigate).toHaveBeenCalledWith('/song')
  })

  it('reads as saved the moment it is, rather than still warning', async () => {
    setUp({ edited: true })
    show()
    expect(screen.getByText(/plays the last version you saved/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Save & back to song' }))
    await act(async () => {})

    expect(screen.queryByText(/plays the last version you saved/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Back to song' })).toBeInTheDocument()
  })

  // Dragging a note away and back rebuilds the note list, but it is the same
  // music -- comparing raw objects would call that an unsaved change.
  it('is about the music, not about object identity', () => {
    const saved: Pattern = { ...createEmptyPattern('Boom Bap'), id: 'boom' }
    const withNote = addNote(saved, { pitch: 2, start: 0, length: 1 })
    const redrawn = addNote(removeNote(withNote, withNote.melody.notes[0].id), {
      pitch: 2,
      start: 0,
      length: 1,
    })

    expect(isUnsaved(redrawn, withNote)).toBe(false)
    expect(isUnsaved(addNote(withNote, { pitch: 5, start: 4, length: 2 }), withNote)).toBe(true)
  })

  it('stays put when the save fails', async () => {
    setUp({ edited: true })
    save.mockRejectedValueOnce(new Error('no room'))
    show()

    fireEvent.click(screen.getByRole('button', { name: 'Save & back to song' }))
    await act(async () => {})

    expect(navigate).not.toHaveBeenCalled()
    expect(screen.getByText(/Could not save/)).toBeInTheDocument()
  })

  // The work is not lost by leaving -- the sequencer keeps it. What the warning
  // is about is the song going on playing the version on disk.
  it('warns before going back without saving', () => {
    setUp({ edited: true })
    const confirm = vi.fn(() => true)
    vi.stubGlobal('confirm', confirm)
    show()

    fireEvent.click(screen.getByRole('button', { name: 'Back without saving' }))
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('last version you saved'))
    expect(navigate).toHaveBeenCalledWith('/song')
  })

  it('stays on the beat when the warning is declined', () => {
    setUp({ edited: true })
    vi.stubGlobal('confirm', vi.fn(() => false))
    show()

    fireEvent.click(screen.getByRole('button', { name: 'Back without saving' }))
    expect(navigate).not.toHaveBeenCalled()
  })
})

/** The nav bar is the other way back, so it carries the same warning. */
describe('the Song link in the header', () => {
  function showNav(path: string) {
    return render(
      <MemoryRouter initialEntries={[path]}>
        <Nav />
      </MemoryRouter>,
    )
  }

  it('warns when leaving the sequencer with an unsaved beat the song uses', () => {
    setUp({ edited: true })
    const confirm = vi.fn(() => false)
    vi.stubGlobal('confirm', confirm)
    showNav('/')

    fireEvent.click(screen.getByRole('link', { name: 'Song' }))
    expect(confirm).toHaveBeenCalledOnce()
  })

  it('says nothing when the beat is saved', () => {
    setUp()
    const confirm = vi.fn(() => true)
    vi.stubGlobal('confirm', confirm)
    showNav('/')

    fireEvent.click(screen.getByRole('link', { name: 'Song' }))
    expect(confirm).not.toHaveBeenCalled()
  })

  it('says nothing when the beat is not in the song', () => {
    setUp({ inSong: false, edited: true })
    const confirm = vi.fn(() => true)
    vi.stubGlobal('confirm', confirm)
    showNav('/')

    fireEvent.click(screen.getByRole('link', { name: 'Song' }))
    expect(confirm).not.toHaveBeenCalled()
  })

  // Coming at the song from elsewhere is not leaving unsaved beat edits behind.
  it('says nothing when leaving a screen other than the sequencer', () => {
    setUp({ edited: true })
    const confirm = vi.fn(() => true)
    vi.stubGlobal('confirm', confirm)
    showNav('/library')

    fireEvent.click(screen.getByRole('link', { name: 'Song' }))
    expect(confirm).not.toHaveBeenCalled()
  })
})

/*
 * The beat editor's ruler goes on counting the beat's own measures from 1, so
 * the header is the only thing that can say where in the song they stand.
 */
describe('which place is being edited', () => {
  it('says the bar the trip in aimed at', () => {
    setUp({ clip: { start: 0, length: 4 }, atBar: 2 })
    show()
    expect(screen.getByText(/bar 3/)).toBeInTheDocument()
  })

  it('spans the bars a longer beat stands in', () => {
    setUp({ measures: 2, clip: { start: 0, length: 4 }, atBar: 2 })
    show()
    expect(screen.getByText(/bars 3–4/)).toBeInTheDocument()
  })

  it('resolves a bar in the middle of a pass to the pass itself', () => {
    setUp({ measures: 2, clip: { start: 0, length: 4 }, atBar: 3 })
    show()
    expect(screen.getByText(/bars 3–4/)).toBeInTheDocument()
  })

  it('falls back to the first place when the trip in named no bar', () => {
    setUp({ clip: { start: 2, length: 2 } })
    show()
    expect(screen.getByText(/bar 3/)).toBeInTheDocument()
  })

  it('says which time through it is, once there is more than one', () => {
    setUp({ clip: { start: 0, length: 4 }, atBar: 2 })
    show()
    expect(screen.getByText(/3rd time it plays/)).toBeInTheDocument()
  })

  it('does not count the times when the beat plays once', () => {
    setUp({ clip: { start: 0, length: 1 } })
    show()
    expect(screen.queryByText(/time it plays/)).not.toBeInTheDocument()
  })

  it('says nothing about a place for a row with nothing arranged on it', () => {
    setUp()
    show()
    expect(screen.getByText(/In the song/)).toBeInTheDocument()
    expect(screen.queryByText(/bar/)).not.toBeInTheDocument()
  })
})
