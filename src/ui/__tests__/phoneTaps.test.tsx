import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import { Grid } from '../Grid'
import { fingerScrolls, movedOff, PHONE_WIDTH, TAP_SLOP } from '../phoneTaps'
import { usePatternStore } from '../../state/patternStore'
import { useSettingsStore } from '../../state/settingsStore'
import { resetTransport } from '../../state/transport'
import { resetEngine, setContextFactory } from '../../audio/context'
import { addNote, createEmptyPattern, isStepOn } from '../../state/schema'
import { MockAudioContext, asAudioContext } from '../../test/mockAudioContext'

let mock: MockAudioContext

/**
 * A screen no wider than the phone breakpoint. Everything here is about which
 * side of that line the app is on, and jsdom answers every media query with a
 * flat no, so the answer has to be supplied.
 */
function onAPhone(is = true) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: is && query.includes(`${PHONE_WIDTH}px`),
    media: query,
  }))
}

function cellFor(track: number, step: number): HTMLElement {
  const cell = document.querySelector<HTMLElement>(`[data-track="${track}"][data-step="${step}"]`)
  if (!cell) throw new Error(`no cell at ${track},${step}`)
  return cell
}

function noteCell(pitch: number, step: number): HTMLElement {
  const cell = document.querySelector<HTMLElement>(`[data-pitch="${pitch}"][data-step="${step}"]`)
  if (!cell) throw new Error(`no melody cell at pitch ${pitch}, step ${step}`)
  return cell
}

function grip(cell: HTMLElement, side: 'start' | 'end'): HTMLElement {
  const handle = cell.querySelector<HTMLElement>(`[data-grip="${side}"]`)
  if (!handle) throw new Error(`no ${side} handle on that cell`)
  return handle
}

function notes() {
  return usePatternStore.getState().pattern.melody.notes
}

/** Down and up in the same place: the whole of a phone's vocabulary. */
function tap(element: HTMLElement) {
  fireEvent.pointerDown(element, { clientX: 100, clientY: 100 })
  fireEvent.pointerUp(element, { clientX: 100, clientY: 100 })
}

/** Pointer capture retargets moves, so the cell under the finger is looked up. */
function dragOver(cells: HTMLElement[], from = 100) {
  cells.forEach((cell, i) => {
    document.elementFromPoint = () => cell
    fireEvent.pointerMove(cell, { clientX: from + (i + 1) * 40, clientY: 100 })
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  resetTransport()
  resetEngine()
  mock = new MockAudioContext()
  setContextFactory(() => asAudioContext(mock))
  usePatternStore.setState({ pattern: createEmptyPattern('Test'), isPlaying: false })
  useSettingsStore.setState({ followPlayhead: true, melodyOpen: true, drumsOpen: true })
  onAPhone()
})

afterEach(() => {
  resetTransport()
  resetEngine()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('who owns the finger', () => {
  it('gives a phone touch to the scroller', () => {
    expect(fingerScrolls({ pointerType: 'touch' })).toBe(true)
  })

  it('leaves a tablet touch painting', () => {
    onAPhone(false)
    expect(fingerScrolls({ pointerType: 'touch' })).toBe(false)
  })

  /* A mouse cannot scroll by dragging, so it has nothing to hand back. */
  it('leaves a mouse painting at any size', () => {
    expect(fingerScrolls({ pointerType: 'mouse' })).toBe(false)
  })

  it('counts a small wander as having stayed put', () => {
    const from = { x: 100, y: 100 }
    expect(movedOff(from, { x: 100 + TAP_SLOP, y: 100 })).toBe(false)
    expect(movedOff(from, { x: 100, y: 100 + TAP_SLOP + 1 })).toBe(true)
  })
})

describe('drums on a phone', () => {
  /*
   * The press is where the tablet turns a step on. Here it cannot: the finger
   * that made it is most likely on its way somewhere, and a grid that flipped
   * a step every time you went to scroll would be unusable.
   */
  it('changes nothing on the press alone', () => {
    render(<Grid />)
    fireEvent.pointerDown(cellFor(0, 4), { clientX: 100, clientY: 100 })

    expect(isStepOn(usePatternStore.getState().pattern.tracks[0], 4)).toBe(false)
  })

  it('turns a step on when the finger lifts where it landed', () => {
    render(<Grid />)
    tap(cellFor(0, 4))

    expect(isStepOn(usePatternStore.getState().pattern.tracks[0], 4)).toBe(true)
  })

  it('turns a filled step off again', () => {
    render(<Grid />)
    tap(cellFor(0, 4))
    tap(cellFor(0, 4))

    expect(isStepOn(usePatternStore.getState().pattern.tracks[0], 4)).toBe(false)
  })

  it('leaves the step alone when the finger travels', () => {
    render(<Grid />)
    fireEvent.pointerDown(cellFor(0, 4), { clientX: 100, clientY: 100 })
    fireEvent.pointerMove(cellFor(0, 4), { clientX: 220, clientY: 100 })
    fireEvent.pointerUp(cellFor(0, 4), { clientX: 220, clientY: 100 })

    expect(isStepOn(usePatternStore.getState().pattern.tracks[0], 4)).toBe(false)
  })

  /* How the browser says it has taken the gesture to scroll with. */
  it('leaves the step alone when the press is cancelled', () => {
    render(<Grid />)
    fireEvent.pointerDown(cellFor(0, 4), { clientX: 100, clientY: 100 })
    fireEvent.pointerCancel(cellFor(0, 4), { clientX: 100, clientY: 100 })

    expect(isStepOn(usePatternStore.getState().pattern.tracks[0], 4)).toBe(false)
  })

  it('paints no run across the cells a drag passes over', () => {
    render(<Grid />)
    fireEvent.pointerDown(cellFor(0, 0), { clientX: 100, clientY: 100 })
    dragOver([cellFor(0, 1), cellFor(0, 2), cellFor(0, 3)])
    fireEvent.pointerUp(cellFor(0, 3), { clientX: 220, clientY: 100 })

    const track = usePatternStore.getState().pattern.tracks[0]
    expect(track.steps.some((step) => step > 0)).toBe(false)
  })
})

describe('the melody on a phone', () => {
  it('draws a one-step note where a finger lifts', () => {
    render(<Grid />)
    tap(noteCell(3, 2))

    expect(notes()).toHaveLength(1)
    expect(notes()[0]).toMatchObject({ pitch: 3, start: 2, length: 1 })
  })

  it('takes a note away when one is tapped', () => {
    usePatternStore.setState({
      pattern: addNote(createEmptyPattern('Test'), { pitch: 3, start: 2, length: 1 }),
    })
    render(<Grid />)
    tap(noteCell(3, 2))

    expect(notes()).toHaveLength(0)
  })

  it('draws nothing when the finger travels', () => {
    render(<Grid />)
    fireEvent.pointerDown(noteCell(3, 2), { clientX: 100, clientY: 100 })
    dragOver([noteCell(3, 3), noteCell(3, 4)])
    fireEvent.pointerUp(noteCell(3, 4), { clientX: 180, clientY: 100 })

    expect(notes()).toHaveLength(0)
  })

  /*
   * The exception. A note's length has no tap that means it, so the handles
   * keep the drag they have always had.
   */
  it('still grows a note from its handle', () => {
    usePatternStore.setState({
      pattern: addNote(createEmptyPattern('Test'), { pitch: 3, start: 2, length: 1 }),
    })
    render(<Grid />)

    fireEvent.pointerDown(grip(noteCell(3, 2), 'end'), { clientX: 100, clientY: 100 })
    dragOver([noteCell(3, 3), noteCell(3, 4)])
    fireEvent.pointerUp(noteCell(3, 4), { clientX: 180, clientY: 100 })

    expect(notes()[0]).toMatchObject({ pitch: 3, start: 2, length: 3 })
  })
})
