import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { SongGrid } from '../SongGrid'
import { useSongStore } from '../../state/songStore'
import { usePatternStore } from '../../state/patternStore'
import { useLibraryStore } from '../../state/libraryStore'
import { useSettingsStore } from '../../state/settingsStore'
import { resetTransport } from '../../state/transport'
import { resetEngine, setContextFactory } from '../../audio/context'
import { createEmptyPattern, type Pattern } from '../../state/schema'
import { addClip, addRow, createEmptySong, type Song } from '../../state/song'
import { MockAudioContext, asAudioContext } from '../../test/mockAudioContext'

const navigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => navigate }
})

const BOOM: Pattern = { ...createEmptyPattern('Boom Bap'), id: 'boom' }
const SHUFFLE: Pattern = { ...createEmptyPattern('Shuffle', 2), id: 'shuffle' }

function renderGrid() {
  return render(
    <MemoryRouter>
      <SongGrid />
    </MemoryRouter>,
  )
}

function cellFor(row: number, bar: number): HTMLElement {
  const cell = document.querySelector<HTMLElement>(`[data-row="${row}"][data-step="${bar}"]`)
  if (!cell) throw new Error(`no cell at row ${row}, bar ${bar}`)
  return cell
}

/**
 * jsdom has no layout, so elementFromPoint never finds anything. The gesture
 * layer reads the cell under the finger through it, so a drag has to say which
 * cell that is.
 */
function dragOver(cell: HTMLElement) {
  document.elementFromPoint = () => cell
  fireEvent.pointerMove(cell, { clientX: 1, clientY: 1, pointerId: 1 })
}

/** The handle at one end of a block; resizing lives entirely in these. */
function grip(cell: HTMLElement, side: 'start' | 'end'): HTMLElement {
  const handle = cell.querySelector<HTMLElement>(`[data-grip="${side}"]`)
  if (!handle) throw new Error(`no ${side} handle on that cell`)
  return handle
}

function clipsOf(rowIndex: number) {
  return useSongStore.getState().song.rows[rowIndex].clips
}

function setSong(song: Song) {
  useSongStore.setState({ song, preview: null, isPlaying: false })
}

beforeEach(() => {
  vi.useFakeTimers()
  navigate.mockClear()
  resetTransport()
  resetEngine()
  setContextFactory(() => asAudioContext(new MockAudioContext()))

  useLibraryStore.setState({
    patterns: [BOOM, SHUFFLE],
    patternsById: new Map([
      [BOOM.id, BOOM],
      [SHUFFLE.id, SHUFFLE],
    ]),
    songs: [],
    loading: false,
    error: null,
  })
  usePatternStore.setState({ pattern: createEmptyPattern('Test'), isPlaying: false })
  useSettingsStore.setState({ followPlayhead: true, melodyOpen: false })
  setSong(addRow(createEmptySong(), BOOM.id))
})

afterEach(() => {
  resetTransport()
  resetEngine()
  vi.restoreAllMocks()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('layout', () => {
  it('names each row after the beat it plays', () => {
    setSong(addRow(addRow(createEmptySong(), BOOM.id), SHUFFLE.id))
    renderGrid()
    expect(screen.getByText('Boom Bap')).toBeInTheDocument()
    expect(screen.getByText('Shuffle')).toBeInTheDocument()
  })

  it('draws a cell per row per bar', () => {
    const song = useSongStore.getState().song
    renderGrid()
    expect(document.querySelectorAll('[data-row]')).toHaveLength(song.bars)
  })

  it('numbers the bars', () => {
    renderGrid()
    expect(screen.getByRole('button', { name: 'Go to bar 1' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Go to bar 8' })).toBeInTheDocument()
  })

  it('says so when the beat a row names has been deleted', () => {
    setSong(addRow(createEmptySong(), 'gone'))
    renderGrid()
    expect(screen.getByText('Missing beat')).toBeInTheDocument()
  })

  it('will not offer to edit a beat that is not there', () => {
    setSong(addRow(createEmptySong(), 'gone'))
    renderGrid()
    expect(screen.getByRole('button', { name: 'Edit Missing beat' })).toBeDisabled()
  })
})

describe('placing beats', () => {
  it('drops a one-bar block where a one-bar beat is tapped', () => {
    renderGrid()
    const cell = cellFor(0, 2)
    fireEvent.pointerDown(cell, { pointerId: 1 })
    fireEvent.pointerUp(cell, { pointerId: 1 })

    expect(clipsOf(0)).toHaveLength(1)
    expect(clipsOf(0)[0]).toMatchObject({ start: 2, length: 1 })
  })

  // Tapping a longer beat and getting one bar of it was silent truncation.
  it('places a longer beat whole when it is tapped', () => {
    setSong(addRow(createEmptySong(), SHUFFLE.id))
    renderGrid()

    const cell = cellFor(0, 1)
    fireEvent.pointerDown(cell, { pointerId: 1 })
    fireEvent.pointerUp(cell, { pointerId: 1 })

    expect(clipsOf(0)[0]).toMatchObject({ start: 1, length: 2 })
  })

  it('shows the whole beat under the finger before it is let go', () => {
    setSong(addRow(createEmptySong(), SHUFFLE.id))
    renderGrid()

    fireEvent.pointerDown(cellFor(0, 1), { pointerId: 1 })
    expect(cellFor(0, 2).className).toContain('note--draft')
  })

  it('will not draw a new block shorter than its beat', () => {
    setSong(addRow(createEmptySong(), SHUFFLE.id))
    renderGrid()

    fireEvent.pointerDown(cellFor(0, 1), { pointerId: 1 })
    dragOver(cellFor(0, 1))
    fireEvent.pointerUp(cellFor(0, 1), { pointerId: 1 })

    expect(clipsOf(0)[0].length).toBe(2)
  })

  // Cutting to a fill is a real thing to want; it just has to be asked for.
  it('still lets an existing block be dragged shorter than its beat', () => {
    setSong(addClip(addRow(createEmptySong(), SHUFFLE.id), 0, { start: 0, length: 2 }))
    renderGrid()

    fireEvent.pointerDown(grip(cellFor(0, 1), 'end'), { pointerId: 1 })
    dragOver(cellFor(0, 0))
    fireEvent.pointerUp(cellFor(0, 0), { pointerId: 1 })

    expect(clipsOf(0)[0]).toMatchObject({ start: 0, length: 1 })
  })

  it('stretches a block by dragging right', () => {
    renderGrid()
    fireEvent.pointerDown(cellFor(0, 1), { pointerId: 1 })
    dragOver(cellFor(0, 4))
    fireEvent.pointerUp(cellFor(0, 4), { pointerId: 1 })

    expect(clipsOf(0)[0]).toMatchObject({ start: 1, length: 4 })
  })

  it('says how many times the beat plays, on the first cell only', () => {
    setSong(addClip(useSongStore.getState().song, 0, { start: 0, length: 3 }))
    renderGrid()
    // A one-bar beat across three bars is three times through.
    expect(cellFor(0, 0).textContent).toBe('×3')
    expect(cellFor(0, 1).textContent).toBe('')
  })

  it('counts passes rather than bars for a longer beat', () => {
    setSong(addClip(addRow(createEmptySong(), SHUFFLE.id), 0, { start: 0, length: 4 }))
    renderGrid()
    // Four bars of a two-bar beat is twice through, not four times.
    expect(cellFor(0, 0).textContent).toBe('×2')
  })

  it('says nothing on a block the beat plays through once', () => {
    setSong(addClip(addRow(createEmptySong(), SHUFFLE.id), 0, { start: 0, length: 2 }))
    renderGrid()
    expect(cellFor(0, 0).textContent).toBe('')
  })

  it('draws a block as one run from end to end', () => {
    setSong(addClip(useSongStore.getState().song, 0, { start: 0, length: 3 }))
    renderGrid()
    expect(cellFor(0, 0).className).toContain('note--start')
    expect(cellFor(0, 1).className).toContain('note--middle')
    expect(cellFor(0, 2).className).toContain('note--end')
    expect(cellFor(0, 3).className).not.toContain('clip--on')
  })

  it('previews the stretch before it is let go', () => {
    renderGrid()
    fireEvent.pointerDown(cellFor(0, 0), { pointerId: 1 })
    dragOver(cellFor(0, 2))

    expect(cellFor(0, 2).className).toContain('note--draft')
    // Nothing is committed until the finger comes up.
    expect(clipsOf(0)).toHaveLength(0)
  })

  it('deletes a block when it is tapped without moving', () => {
    setSong(addClip(useSongStore.getState().song, 0, { start: 0, length: 2 }))
    renderGrid()

    const cell = cellFor(0, 1)
    fireEvent.pointerDown(cell, { pointerId: 1 })
    fireEvent.pointerUp(cell, { pointerId: 1 })

    expect(clipsOf(0)).toHaveLength(0)
  })

  it('shortens a block by dragging its end back', () => {
    setSong(addClip(useSongStore.getState().song, 0, { start: 0, length: 4 }))
    renderGrid()

    fireEvent.pointerDown(grip(cellFor(0, 3), 'end'), { pointerId: 1 })
    dragOver(cellFor(0, 1))
    fireEvent.pointerUp(cellFor(0, 1), { pointerId: 1 })

    expect(clipsOf(0)[0]).toMatchObject({ start: 0, length: 2 })
  })

  // A one-bar block has both handles and, between them, a middle -- which is
  // the only way it can be moved at all.
  it('moves a one-bar block dragged by its middle', () => {
    setSong(addClip(useSongStore.getState().song, 0, { start: 1, length: 1 }))
    renderGrid()

    fireEvent.pointerDown(cellFor(0, 1), { pointerId: 1 })
    dragOver(cellFor(0, 5))
    fireEvent.pointerUp(cellFor(0, 5), { pointerId: 1 })

    expect(clipsOf(0)[0]).toMatchObject({ start: 5, length: 1 })
  })

  it('resizes a one-bar block from its end handle instead', () => {
    setSong(addClip(useSongStore.getState().song, 0, { start: 1, length: 1 }))
    renderGrid()

    fireEvent.pointerDown(grip(cellFor(0, 1), 'end'), { pointerId: 1 })
    dragOver(cellFor(0, 4))
    fireEvent.pointerUp(cellFor(0, 4), { pointerId: 1 })

    expect(clipsOf(0)[0]).toMatchObject({ start: 1, length: 4 })
  })

  // A row *is* which beat plays, so a clip dragged upwards would silently
  // change the beat rather than move the block.
  it('keeps a block on its own row however far the finger strays', () => {
    setSong(addClip(addRow(useSongStore.getState().song, SHUFFLE.id), 0, { start: 0, length: 3 }))
    renderGrid()

    fireEvent.pointerDown(cellFor(0, 1), { pointerId: 1 })
    dragOver(cellFor(1, 4))
    fireEvent.pointerUp(cellFor(1, 4), { pointerId: 1 })

    expect(clipsOf(1)).toHaveLength(0)
    expect(clipsOf(0)[0]).toMatchObject({ start: 3, length: 3 })
  })
})

describe('showing how the beat repeats', () => {
  it('says how long the beat on a row is', () => {
    setSong(addRow(addRow(createEmptySong(), BOOM.id), SHUFFLE.id))
    renderGrid()
    expect(screen.getByText('1 bar')).toBeInTheDocument()
    expect(screen.getByText('2 bars')).toBeInTheDocument()
  })

  it('leaves the gap open where the beat starts again', () => {
    setSong(addClip(addRow(createEmptySong(), SHUFFLE.id), 0, { start: 0, length: 4 }))
    renderGrid()

    // Bars 1-2 are one pass and stay joined; bar 3 starts the next one.
    expect(cellFor(0, 0).className).toContain('note--bridge')
    expect(cellFor(0, 1).className).not.toContain('note--bridge')
    expect(cellFor(0, 2).className).toContain('note--bridge')
  })

  it('joins every bar of a block the beat only plays once through', () => {
    setSong(addClip(addRow(createEmptySong(), SHUFFLE.id), 0, { start: 0, length: 2 }))
    renderGrid()
    expect(cellFor(0, 0).className).toContain('note--bridge')
  })

  it('marks the part of a block that cuts the beat short', () => {
    setSong(addClip(addRow(createEmptySong(), SHUFFLE.id), 0, { start: 0, length: 3 }))
    renderGrid()

    expect(cellFor(0, 0).className).not.toContain('clip--cut')
    expect(cellFor(0, 1).className).not.toContain('clip--cut')
    expect(cellFor(0, 2).className).toContain('clip--cut')
  })

  it('marks nothing when the beat comes out even', () => {
    setSong(addClip(addRow(createEmptySong(), SHUFFLE.id), 0, { start: 0, length: 4 }))
    renderGrid()
    expect(document.querySelectorAll('.clip--cut')).toHaveLength(0)
  })

  it('says as much to a screen reader', () => {
    setSong(addClip(addRow(createEmptySong(), SHUFFLE.id), 0, { start: 0, length: 3 }))
    renderGrid()

    expect(screen.getByLabelText('Shuffle bar 3, cut short')).toBeInTheDocument()
    expect(screen.getByLabelText('Shuffle bar 1')).toBeInTheDocument()
  })

  // The song's length is the user's choice, so placement clamps to it rather
  // than growing it -- but the block then says it is cutting the beat short.
  it('marks a beat clipped by the end of the song', () => {
    setSong(addRow(createEmptySong(), SHUFFLE.id))
    renderGrid()

    const last = cellFor(0, 7)
    fireEvent.pointerDown(last, { pointerId: 1 })
    fireEvent.pointerUp(last, { pointerId: 1 })

    expect(clipsOf(0)[0]).toMatchObject({ start: 7, length: 1 })
    expect(cellFor(0, 7).className).toContain('clip--cut')
  })
})

describe('rows and bars', () => {
  it('mutes a row', () => {
    renderGrid()
    fireEvent.click(screen.getByRole('button', { name: 'Mute Boom Bap' }))
    expect(useSongStore.getState().song.rows[0].muted).toBe(true)
  })

  it('sets a row level', () => {
    renderGrid()
    fireEvent.change(screen.getByLabelText('Boom Bap volume'), { target: { value: '0.4' } })
    expect(useSongStore.getState().song.rows[0].level).toBeCloseTo(0.4)
  })

  it('removes a row', () => {
    renderGrid()
    fireEvent.click(screen.getByRole('button', { name: 'Remove Boom Bap from the song' }))
    expect(useSongStore.getState().song.rows).toHaveLength(0)
  })

  it('opens a row beat in the sequencer', () => {
    renderGrid()
    fireEvent.click(screen.getByRole('button', { name: 'Edit Boom Bap' }))
    expect(usePatternStore.getState().pattern.id).toBe(BOOM.id)
    expect(navigate).toHaveBeenCalledWith('/')
  })

  it('adds a bar', () => {
    const before = useSongStore.getState().song.bars
    renderGrid()
    fireEvent.click(screen.getByRole('button', { name: 'Add a bar' }))
    expect(useSongStore.getState().song.bars).toBe(before + 1)
  })

  it('removes an empty bar without asking', () => {
    const confirm = vi.fn(() => true)
    vi.stubGlobal('confirm', confirm)
    renderGrid()

    fireEvent.click(screen.getByRole('button', { name: 'Remove bar 3' }))
    expect(confirm).not.toHaveBeenCalled()
    expect(useSongStore.getState().song.bars).toBe(7)
  })

  it('asks before removing a bar with something in it', () => {
    setSong(addClip(useSongStore.getState().song, 0, { start: 2, length: 1 }))
    const confirm = vi.fn(() => false)
    vi.stubGlobal('confirm', confirm)
    renderGrid()

    fireEvent.click(screen.getByRole('button', { name: 'Remove bar 3' }))
    expect(confirm).toHaveBeenCalled()
    expect(useSongStore.getState().song.bars).toBe(8)
  })
})

describe('adding a beat', () => {
  it('offers the saved beats to choose from', async () => {
    renderGrid()
    fireEvent.click(screen.getByRole('button', { name: '+ Add a beat' }))
    await act(async () => {})

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Shuffle/ })).toBeInTheDocument()
  })

  it('adds a row for the beat that is picked', async () => {
    renderGrid()
    fireEvent.click(screen.getByRole('button', { name: '+ Add a beat' }))
    await act(async () => {})
    fireEvent.click(screen.getByRole('button', { name: /Shuffle/ }))

    const rows = useSongStore.getState().song.rows
    expect(rows).toHaveLength(2)
    expect(rows[1].patternId).toBe(SHUFFLE.id)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
