import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { Nav } from '../App'
import { SongTransport } from '../Transport'
import { SongCard } from '../SongCard'
import { LibraryScreen } from '../LibraryScreen'
import { songIsUnsaved } from '../unsaved'
import { useSongStore } from '../../state/songStore'
import { usePatternStore } from '../../state/patternStore'
import { useLibraryStore } from '../../state/libraryStore'
import { resetTransport } from '../../state/transport'
import { resetEngine, setContextFactory } from '../../audio/context'
import { createEmptyPattern } from '../../state/schema'
import {
  addClip,
  addRow,
  createEmptySong,
  removeClip,
  renameSong,
  setRowLevel,
  type Song,
} from '../../state/song'
import { MockAudioContext, asAudioContext } from '../../test/mockAudioContext'

const navigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => navigate }
})

/** A song with one row and one block, as the library has it. */
function arranged(name = 'Opener'): Song {
  const song = addClip(addRow(createEmptySong(name), 'boom'), 0, { start: 0, length: 2 })
  return { ...song, id: 'opener' }
}

function setUp(working: Song, saved: Song[] = [arranged()]) {
  useLibraryStore.setState({
    patterns: [],
    patternsById: new Map(),
    songs: saved,
    loading: false,
    error: null,
  })
  useSongStore.setState({ song: working, preview: null, isPlaying: false })
}

function show(node: React.ReactElement, path = '/song') {
  return render(<MemoryRouter initialEntries={[path]}>{node}</MemoryRouter>)
}

beforeEach(() => {
  vi.useFakeTimers()
  navigate.mockClear()
  resetTransport()
  resetEngine()
  setContextFactory(() => asAudioContext(new MockAudioContext()))
  usePatternStore.setState({ pattern: createEmptyPattern('Beat'), preview: null, isPlaying: false })
})

afterEach(() => {
  resetTransport()
  resetEngine()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('deciding whether a song is unsaved', () => {
  // The store always holds a blank song before anything has been opened, and
  // warning about that would be noise on the very first visit.
  it('says nothing about a song nobody has put a beat in', () => {
    expect(songIsUnsaved(createEmptySong(), undefined)).toBe(false)
  })

  it('counts an arrangement the library has never seen', () => {
    expect(songIsUnsaved(arranged(), undefined)).toBe(true)
  })

  it('is clean against an identical saved copy', () => {
    expect(songIsUnsaved(arranged(), arranged())).toBe(false)
  })

  it('notices a renamed song', () => {
    expect(songIsUnsaved(renameSong(arranged(), 'Closer'), arranged())).toBe(true)
  })

  it('notices a row level moved', () => {
    expect(songIsUnsaved(setRowLevel(arranged(), 0, 0.3), arranged())).toBe(true)
  })

  it('notices a block resized', () => {
    const longer = addClip(removeClipsOf(arranged()), 0, { start: 0, length: 4 })
    expect(songIsUnsaved(longer, arranged())).toBe(true)
  })

  // Dragging a block away and back gives it a new id but the same arrangement.
  it('is about the arrangement, not about object identity', () => {
    const saved = arranged()
    const redrawn = addClip(removeClipsOf(saved), 0, { start: 0, length: 2 })
    expect(songIsUnsaved(redrawn, saved)).toBe(false)
  })
})

function removeClipsOf(song: Song): Song {
  return song.rows[0].clips.reduce((acc, clip) => removeClip(acc, 0, clip.id), song)
}

describe('the song transport', () => {
  it('says nothing while the song matches what was saved', () => {
    setUp(arranged())
    show(<SongTransport />)
    expect(screen.queryByText('Unsaved')).not.toBeInTheDocument()
  })

  it('marks the song as unsaved once it is edited', () => {
    setUp(setRowLevel(arranged(), 0, 0.3))
    show(<SongTransport />)
    expect(screen.getByText('Unsaved')).toBeInTheDocument()
  })
})

describe('the Library link while arranging', () => {
  it('warns about unsaved changes on the way to the library', () => {
    setUp(setRowLevel(arranged(), 0, 0.3))
    const confirm = vi.fn(() => false)
    vi.stubGlobal('confirm', confirm)
    show(<Nav />)

    fireEvent.click(screen.getByRole('link', { name: 'Library' }))
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('discard them'))
  })

  it('says nothing when the song is saved', () => {
    setUp(arranged())
    const confirm = vi.fn(() => true)
    vi.stubGlobal('confirm', confirm)
    show(<Nav />)

    fireEvent.click(screen.getByRole('link', { name: 'Library' }))
    expect(confirm).not.toHaveBeenCalled()
  })

  // Going to the beat screen loses nothing -- the song is still there when you
  // come back, and fixing a beat mid-arrangement is the ordinary workflow.
  it('does not nag on the way to the beat screen', () => {
    setUp(setRowLevel(arranged(), 0, 0.3))
    const confirm = vi.fn(() => true)
    vi.stubGlobal('confirm', confirm)
    show(<Nav />)

    fireEvent.click(screen.getByRole('link', { name: 'Beat' }))
    expect(confirm).not.toHaveBeenCalled()
  })

  it('leaves the library alone when you are not arranging', () => {
    setUp(setRowLevel(arranged(), 0, 0.3))
    const confirm = vi.fn(() => true)
    vi.stubGlobal('confirm', confirm)
    show(<Nav />, '/')

    fireEvent.click(screen.getByRole('link', { name: 'Library' }))
    expect(confirm).not.toHaveBeenCalled()
  })
})

/**
 * The boundary warning can be walked past, or missed entirely by reaching the
 * library from the beat screen, so the guard on the act itself is the one that
 * has to hold.
 */
describe('the moment an arrangement would be thrown away', () => {
  const other: Song = { ...arranged('Other'), id: 'other' }

  it('warns before opening another song over unsaved work', () => {
    setUp(setRowLevel(arranged(), 0, 0.3), [arranged(), other])
    const confirm = vi.fn(() => false)
    vi.stubGlobal('confirm', confirm)
    show(<SongCard song={other} />)

    fireEvent.click(screen.getByRole('button', { name: 'Open' }))
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('Opening "Other"'))
    expect(useSongStore.getState().song.id).toBe('opener')
    expect(navigate).not.toHaveBeenCalled()
  })

  it('opens it when the warning is accepted', () => {
    setUp(setRowLevel(arranged(), 0, 0.3), [arranged(), other])
    vi.stubGlobal('confirm', vi.fn(() => true))
    show(<SongCard song={other} />)

    fireEvent.click(screen.getByRole('button', { name: 'Open' }))
    expect(useSongStore.getState().song.id).toBe('other')
    expect(navigate).toHaveBeenCalledWith('/song')
  })

  // Reopening the song you are editing resets it to the saved copy, which is
  // just as much a discard.
  it('warns about reopening the very song being edited', () => {
    const working = setRowLevel(arranged(), 0, 0.3)
    setUp(working)
    const confirm = vi.fn(() => false)
    vi.stubGlobal('confirm', confirm)
    show(<SongCard song={arranged()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Open' }))
    expect(confirm).toHaveBeenCalled()
    expect(useSongStore.getState().song).toBe(working)
  })

  it('opens without a word when there is nothing unsaved', () => {
    setUp(arranged(), [arranged(), other])
    const confirm = vi.fn(() => true)
    vi.stubGlobal('confirm', confirm)
    show(<SongCard song={other} />)

    fireEvent.click(screen.getByRole('button', { name: 'Open' }))
    expect(confirm).not.toHaveBeenCalled()
    expect(useSongStore.getState().song.id).toBe('other')
  })

  it('warns before starting a new song over unsaved work', async () => {
    setUp(setRowLevel(arranged(), 0, 0.3))
    const confirm = vi.fn(() => false)
    vi.stubGlobal('confirm', confirm)
    show(<LibraryScreen />, '/library')
    await act(async () => {})

    fireEvent.click(screen.getByRole('button', { name: 'New song' }))
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('Starting a new song'))
    expect(useSongStore.getState().song.id).toBe('opener')
  })
})
