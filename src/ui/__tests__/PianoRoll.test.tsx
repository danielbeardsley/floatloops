import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { Grid } from '../Grid'
import { usePatternStore } from '../../state/patternStore'
import { useSettingsStore } from '../../state/settingsStore'
import { resetTransport } from '../../state/transport'
import { resetEngine, setContextFactory } from '../../audio/context'
import { addNote, createEmptyPattern } from '../../state/schema'
import { PITCH_COUNT, pitchName } from '../../audio/scale'
import { MockAudioContext, asAudioContext } from '../../test/mockAudioContext'

function noteCell(pitch: number, step: number): HTMLElement {
  const cell = document.querySelector<HTMLElement>(`[data-pitch="${pitch}"][data-step="${step}"]`)
  if (!cell) throw new Error(`no melody cell at pitch ${pitch}, step ${step}`)
  return cell
}

function notes() {
  return usePatternStore.getState().pattern.melody.notes
}

/** Pointer capture retargets moves, so the cell under the finger is looked up. */
function dragOver(cells: HTMLElement[]) {
  for (const cell of cells) {
    document.elementFromPoint = () => cell
    fireEvent.pointerMove(cell, { clientX: 1, clientY: 1 })
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  resetTransport()
  resetEngine()
  setContextFactory(() => asAudioContext(new MockAudioContext()))
  usePatternStore.setState({ pattern: createEmptyPattern('Test'), isPlaying: false })
  useSettingsStore.setState({ followPlayhead: true, melodyOpen: true })
})

afterEach(() => {
  resetTransport()
  resetEngine()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('the melody section', () => {
  it('is collapsed to begin with', () => {
    useSettingsStore.setState({ melodyOpen: false })
    render(<Grid />)
    expect(document.querySelectorAll('[data-pitch]')).toHaveLength(0)
    expect(screen.getByRole('button', { name: /^melody/i })).toHaveAttribute(
      'aria-expanded',
      'false',
    )
  })

  it('expands to a row per pitch', () => {
    useSettingsStore.setState({ melodyOpen: false })
    render(<Grid />)
    fireEvent.click(screen.getByRole('button', { name: /^melody/i }))

    expect(useSettingsStore.getState().melodyOpen).toBe(true)
    expect(document.querySelectorAll('[data-pitch]')).toHaveLength(PITCH_COUNT * 16)
  })

  it('labels the rows with note names, highest first', () => {
    render(<Grid />)
    const labels = Array.from(document.querySelectorAll('.row__label--pitch .row__name'))
    expect(labels[0].textContent).toBe(pitchName(PITCH_COUNT - 1))
    expect(labels.at(-1)!.textContent).toBe(pitchName(0))
  })

  it('says how many notes are hidden while it is collapsed', () => {
    usePatternStore.setState({
      pattern: addNote(createEmptyPattern(), { pitch: 1, start: 0, length: 2 }),
    })
    useSettingsStore.setState({ melodyOpen: false })
    render(<Grid />)
    expect(screen.getByRole('button', { name: /^melody/i })).toHaveTextContent('1')
  })
})

describe('drawing notes', () => {
  it('a tap makes a note one step long', () => {
    render(<Grid />)
    fireEvent.pointerDown(noteCell(3, 2))
    fireEvent.pointerUp(noteCell(3, 2))

    expect(notes()).toHaveLength(1)
    expect(notes()[0]).toMatchObject({ pitch: 3, start: 2, length: 1 })
  })

  it('a drag to the right sets the length', () => {
    render(<Grid />)
    fireEvent.pointerDown(noteCell(3, 2))
    dragOver([noteCell(3, 3), noteCell(3, 4), noteCell(3, 5)])
    fireEvent.pointerUp(noteCell(3, 5))

    expect(notes()[0]).toMatchObject({ start: 2, length: 4 })
  })

  it('shows the note taking shape before it is committed', () => {
    render(<Grid />)
    fireEvent.pointerDown(noteCell(3, 2))
    dragOver([noteCell(3, 4)])

    expect(noteCell(3, 3).className).toContain('note--draft')
    // Nothing is stored until the finger comes up.
    expect(notes()).toHaveLength(0)
  })

  it('keeps the note on the row it started on', () => {
    render(<Grid />)
    fireEvent.pointerDown(noteCell(3, 2))
    dragOver([noteCell(6, 5)])
    fireEvent.pointerUp(noteCell(6, 5))

    expect(notes()[0]).toMatchObject({ pitch: 3, length: 1 })
  })

  it('does not run backwards when the drag goes left', () => {
    render(<Grid />)
    fireEvent.pointerDown(noteCell(3, 6))
    dragOver([noteCell(3, 1)])
    fireEvent.pointerUp(noteCell(3, 1))

    expect(notes()[0]).toMatchObject({ start: 6, length: 1 })
  })

  it('marks every cell the note covers', () => {
    render(<Grid />)
    fireEvent.pointerDown(noteCell(3, 2))
    dragOver([noteCell(3, 4)])
    fireEvent.pointerUp(noteCell(3, 4))

    expect(noteCell(3, 2).className).toContain('note--start')
    expect(noteCell(3, 3).className).toContain('note--middle')
    expect(noteCell(3, 4).className).toContain('note--end')
    expect(noteCell(3, 5).className).not.toContain('note--on')
  })
})

describe('removing notes', () => {
  it('a tap on a note deletes it', () => {
    usePatternStore.setState({
      pattern: addNote(createEmptyPattern(), { pitch: 3, start: 2, length: 3 }),
    })
    render(<Grid />)
    fireEvent.pointerDown(noteCell(3, 3))

    expect(notes()).toEqual([])
  })

  it('deleting does not start drawing a new note', () => {
    usePatternStore.setState({
      pattern: addNote(createEmptyPattern(), { pitch: 3, start: 2, length: 3 }),
    })
    render(<Grid />)
    fireEvent.pointerDown(noteCell(3, 3))
    dragOver([noteCell(3, 6)])
    fireEvent.pointerUp(noteCell(3, 6))

    expect(notes()).toEqual([])
  })
})

describe('melody controls', () => {
  it('stays reachable while the section is collapsed', () => {
    useSettingsStore.setState({ melodyOpen: false })
    render(<Grid />)

    // The melody still plays when collapsed, so its volume must still be here.
    expect(screen.getByLabelText('Melody volume')).toBeInTheDocument()
    expect(screen.getByLabelText('Mute melody')).toBeInTheDocument()
  })

  it('sets the volume without expanding the section', () => {
    useSettingsStore.setState({ melodyOpen: false })
    render(<Grid />)
    fireEvent.change(screen.getByLabelText('Melody volume'), { target: { value: '0.15' } })

    expect(usePatternStore.getState().pattern.melody.level).toBeCloseTo(0.15)
    expect(useSettingsStore.getState().melodyOpen).toBe(false)
  })

  it('mutes the melody', () => {
    render(<Grid />)
    fireEvent.click(screen.getByLabelText('Mute melody'))
    expect(usePatternStore.getState().pattern.melody.muted).toBe(true)
  })

  it('sets the melody volume', () => {
    render(<Grid />)
    fireEvent.change(screen.getByLabelText('Melody volume'), { target: { value: '0.3' } })
    expect(usePatternStore.getState().pattern.melody.level).toBeCloseTo(0.3)
  })
})

describe('drums and melody together', () => {
  it('drawing a note leaves the drum grid alone', () => {
    render(<Grid />)
    fireEvent.pointerDown(noteCell(3, 2))
    fireEvent.pointerUp(noteCell(3, 2))

    const drums = usePatternStore.getState().pattern.tracks
    expect(drums.every((t) => t.steps.every((s) => s === 0))).toBe(true)
  })

  it('painting drums leaves the melody alone', () => {
    render(<Grid />)
    const drumCell = document.querySelector<HTMLElement>('[data-track="0"][data-step="0"]')!
    fireEvent.pointerDown(drumCell)
    fireEvent.pointerUp(drumCell)

    expect(notes()).toEqual([])
    expect(usePatternStore.getState().pattern.tracks[0].steps[0]).toBe(1)
  })
})
