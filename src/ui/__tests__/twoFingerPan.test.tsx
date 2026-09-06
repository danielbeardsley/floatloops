import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { fireEvent, render } from '@testing-library/react'
import { Grid } from '../Grid'
import { SongGrid } from '../SongGrid'
import { centroid, panBy } from '../useTwoFingerPan'
import { usePatternStore } from '../../state/patternStore'
import { useSongStore } from '../../state/songStore'
import { useLibraryStore } from '../../state/libraryStore'
import { useSettingsStore } from '../../state/settingsStore'
import { resetTransport } from '../../state/transport'
import { resetEngine, setContextFactory } from '../../audio/context'
import { createEmptyPattern, type Pattern } from '../../state/schema'
import { addRow, createEmptySong } from '../../state/song'
import { MockAudioContext, asAudioContext } from '../../test/mockAudioContext'

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => vi.fn() }
})

const BEAT: Pattern = { ...createEmptyPattern('Boom', 2), id: 'boom' }

/**
 * jsdom has no layout, so scroll offsets never move on their own. Standing in
 * for them is what lets the wiring be tested at all.
 */
function trackScrolling(element: HTMLElement) {
  const at = { left: 0, top: 0 }
  Object.defineProperty(element, 'scrollLeft', {
    configurable: true,
    get: () => at.left,
    set: (value: number) => {
      at.left = value
    },
  })
  Object.defineProperty(element, 'scrollTop', {
    configurable: true,
    get: () => at.top,
    set: (value: number) => {
      at.top = value
    },
  })
  return at
}

function grid(): HTMLElement {
  return document.querySelector<HTMLElement>('.grid')!
}

function cell(selector: string): HTMLElement {
  const found = document.querySelector<HTMLElement>(selector)
  if (!found) throw new Error(`no cell for ${selector}`)
  return found
}

/** One finger down at a point, on the given cell. */
function down(target: HTMLElement, pointerId: number, x: number, y: number) {
  fireEvent.pointerDown(target, { pointerId, clientX: x, clientY: y })
}

function move(target: HTMLElement, pointerId: number, x: number, y: number) {
  document.elementFromPoint = () => target
  fireEvent.pointerMove(target, { pointerId, clientX: x, clientY: y })
}

beforeEach(() => {
  vi.useFakeTimers()
  resetTransport()
  resetEngine()
  setContextFactory(() => asAudioContext(new MockAudioContext()))
  usePatternStore.setState({ pattern: createEmptyPattern('Test', 2), preview: null, isPlaying: false })
  useLibraryStore.setState({
    patterns: [BEAT],
    patternsById: new Map([[BEAT.id, BEAT]]),
    songs: [],
    loading: false,
    error: null,
  })
  useSongStore.setState({
    song: addRow(createEmptySong(), BEAT.id),
    preview: null,
    isPlaying: false,
  })
  useSettingsStore.setState({ followPlayhead: false, melodyOpen: true })
})

afterEach(() => {
  resetTransport()
  resetEngine()
  vi.restoreAllMocks()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('the pan arithmetic', () => {
  it('is the middle of every finger down', () => {
    expect(centroid([{ x: 0, y: 0 }, { x: 10, y: 20 }])).toEqual({ x: 5, y: 10 })
  })

  it('copes with no fingers at all', () => {
    expect(centroid([])).toEqual({ x: 0, y: 0 })
  })

  // Dragging rightwards brings what is off to the left into view, the way a
  // map does -- which is the opposite sign to the scroll offset.
  it('moves the content with the fingers, not against them', () => {
    expect(panBy({ x: 100, y: 100 }, { x: 130, y: 90 })).toEqual({ x: -30, y: 10 })
  })
})

describe('two fingers on the beat grid', () => {
  it('scrolls in both directions at once', () => {
    render(<Grid />)
    const at = trackScrolling(grid())

    down(cell('[data-track="0"][data-step="0"]'), 1, 100, 100)
    down(cell('[data-track="1"][data-step="1"]'), 2, 200, 200)
    move(cell('[data-track="1"][data-step="1"]'), 2, 160, 140)

    // The centroid moved by (-20, -30), so the grid scrolls the other way.
    expect(at.left).toBe(20)
    expect(at.top).toBe(30)
  })

  // The cell the first finger happened to land on was never meant to be painted.
  it('puts back the step the first finger painted', () => {
    render(<Grid />)
    trackScrolling(grid())

    down(cell('[data-track="0"][data-step="3"]'), 1, 100, 100)
    expect(usePatternStore.getState().pattern.tracks[0].steps[3]).toBe(1)

    down(cell('[data-track="0"][data-step="4"]'), 2, 200, 200)
    expect(usePatternStore.getState().pattern.tracks[0].steps[3]).toBe(0)
    expect(usePatternStore.getState().pattern.tracks[0].steps[4]).toBe(0)
  })

  it('puts back a whole stroke, not just the last cell', () => {
    render(<Grid />)
    trackScrolling(grid())

    down(cell('[data-track="2"][data-step="0"]'), 1, 100, 100)
    move(cell('[data-track="2"][data-step="1"]'), 1, 110, 100)
    move(cell('[data-track="2"][data-step="2"]'), 1, 120, 100)
    expect(usePatternStore.getState().pattern.tracks[2].steps.slice(0, 3)).toEqual([1, 1, 1])

    down(cell('[data-track="2"][data-step="8"]'), 2, 300, 200)
    expect(usePatternStore.getState().pattern.tracks[2].steps.slice(0, 3)).toEqual([0, 0, 0])
  })

  it('leaves an erased step erased when the stroke is undone', () => {
    usePatternStore.setState({
      pattern: usePatternStore.getState().pattern,
    })
    render(<Grid />)
    trackScrolling(grid())

    // Turn one on and finish the stroke, so it is committed.
    const first = cell('[data-track="0"][data-step="6"]')
    down(first, 1, 100, 100)
    fireEvent.pointerUp(first, { pointerId: 1 })
    expect(usePatternStore.getState().pattern.tracks[0].steps[6]).toBe(1)

    // Now start erasing it, then reach for a scroll.
    down(first, 3, 100, 100)
    expect(usePatternStore.getState().pattern.tracks[0].steps[6]).toBe(0)
    down(cell('[data-track="0"][data-step="9"]'), 4, 300, 100)
    expect(usePatternStore.getState().pattern.tracks[0].steps[6]).toBe(1)
  })

  it('abandons a melody note rather than drawing it', () => {
    render(<Grid />)
    trackScrolling(grid())

    down(cell('[data-pitch="3"][data-step="2"]'), 1, 100, 100)
    move(cell('[data-pitch="3"][data-step="5"]'), 1, 200, 100)
    down(cell('[data-pitch="3"][data-step="8"]'), 2, 300, 100)
    fireEvent.pointerUp(cell('[data-pitch="3"][data-step="8"]'), { pointerId: 2 })
    fireEvent.pointerUp(cell('[data-pitch="3"][data-step="5"]'), { pointerId: 1 })

    expect(usePatternStore.getState().pattern.melody.notes).toEqual([])
  })

  it('leaves one finger painting exactly as before', () => {
    render(<Grid />)
    trackScrolling(grid())

    const target = cell('[data-track="1"][data-step="7"]')
    down(target, 1, 100, 100)
    fireEvent.pointerUp(target, { pointerId: 1 })

    expect(usePatternStore.getState().pattern.tracks[1].steps[7]).toBe(1)
  })

  // The chrome around the grid is already panned by the browser; a second
  // panner on top of it would move everything twice as fast.
  it('stays out of it when the gesture began off the cells', () => {
    render(<Grid />)
    const at = trackScrolling(grid())

    const label = document.querySelector<HTMLElement>('.row__label')!
    down(label, 1, 100, 100)
    down(cell('[data-track="0"][data-step="0"]'), 2, 200, 200)
    move(cell('[data-track="0"][data-step="0"]'), 2, 160, 140)

    expect(at.left).toBe(0)
    expect(at.top).toBe(0)
  })
})

describe('two fingers on the song grid', () => {
  it('scrolls the arrangement', () => {
    render(
      <MemoryRouter>
        <SongGrid />
      </MemoryRouter>,
    )
    const at = trackScrolling(document.querySelector<HTMLElement>('.grid--song')!)

    down(cell('[data-row="0"][data-step="0"]'), 1, 100, 100)
    down(cell('[data-row="0"][data-step="1"]'), 2, 200, 100)
    move(cell('[data-row="0"][data-step="1"]'), 2, 140, 100)

    expect(at.left).toBe(30)
  })

  it('abandons the block it would have drawn', () => {
    render(
      <MemoryRouter>
        <SongGrid />
      </MemoryRouter>,
    )
    trackScrolling(document.querySelector<HTMLElement>('.grid--song')!)

    down(cell('[data-row="0"][data-step="0"]'), 1, 100, 100)
    down(cell('[data-row="0"][data-step="3"]'), 2, 300, 100)
    fireEvent.pointerUp(cell('[data-row="0"][data-step="3"]'), { pointerId: 2 })
    fireEvent.pointerUp(cell('[data-row="0"][data-step="0"]'), { pointerId: 1 })

    expect(useSongStore.getState().song.rows[0].clips).toEqual([])
  })
})
