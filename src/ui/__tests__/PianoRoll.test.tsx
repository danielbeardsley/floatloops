import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { Grid } from '../Grid'
import { usePatternStore } from '../../state/patternStore'
import { useSettingsStore } from '../../state/settingsStore'
import { resetTransport } from '../../state/transport'
import { resetEngine, setContextFactory } from '../../audio/context'
import { addNote, createEmptyPattern } from '../../state/schema'
import { PITCH_COUNT, pitchName } from '../../audio/scale'
import { MELODY_VOICE_IDS } from '../../audio/melodyKit'
import { MockAudioContext, asAudioContext } from '../../test/mockAudioContext'

let mock: MockAudioContext

/** Auditioning unlocks the context first, so let the promise settle. */
async function settle() {
  await act(async () => {})
}

/** How long a voice was scheduled to sound for. */
function voiceLength(index: number) {
  const osc = mock.oscillators[index]
  return osc.stoppedAt! - osc.startedAt!
}

function noteCell(pitch: number, step: number): HTMLElement {
  const cell = document.querySelector<HTMLElement>(`[data-pitch="${pitch}"][data-step="${step}"]`)
  if (!cell) throw new Error(`no melody cell at pitch ${pitch}, step ${step}`)
  return cell
}

function notes() {
  return usePatternStore.getState().pattern.melody.notes
}

/**
 * The handle at one end of a note. Resizing lives entirely in these, so a
 * press on the cell around them means move.
 */
function grip(cell: HTMLElement, side: 'start' | 'end'): HTMLElement {
  const handle = cell.querySelector<HTMLElement>(`[data-grip="${side}"]`)
  if (!handle) throw new Error(`no ${side} handle on that cell`)
  return handle
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
  mock = new MockAudioContext()
  setContextFactory(() => asAudioContext(mock))
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

describe('editing notes', () => {
  /** A note on row 3 covering steps 2, 3 and 4. */
  function withNote() {
    usePatternStore.setState({
      pattern: addNote(createEmptyPattern(), { pitch: 3, start: 2, length: 3 }),
    })
    render(<Grid />)
  }

  it('dragging the end handle extends it', () => {
    withNote()
    fireEvent.pointerDown(grip(noteCell(3, 4), 'end'))
    dragOver([noteCell(3, 7)])
    fireEvent.pointerUp(noteCell(3, 7))

    expect(notes()[0]).toMatchObject({ start: 2, length: 6 })
  })

  it('dragging the end handle inward shrinks it', () => {
    withNote()
    fireEvent.pointerDown(grip(noteCell(3, 4), 'end'))
    dragOver([noteCell(3, 3)])
    fireEvent.pointerUp(noteCell(3, 3))

    expect(notes()[0]).toMatchObject({ start: 2, length: 2 })
  })

  it('dragging the start handle extends it backwards, leaving the end put', () => {
    withNote()
    fireEvent.pointerDown(grip(noteCell(3, 2), 'start'))
    dragOver([noteCell(3, 0)])
    fireEvent.pointerUp(noteCell(3, 0))

    expect(notes()[0]).toMatchObject({ start: 0, length: 5 })
  })

  // The handles are the only thing that resizes, so the rest of an end cell
  // moves the note like any other part of it.
  it('dragging an end cell away from its handle moves the note', () => {
    withNote()
    fireEvent.pointerDown(noteCell(3, 4))
    dragOver([noteCell(3, 6)])
    fireEvent.pointerUp(noteCell(3, 6))

    expect(notes()[0]).toMatchObject({ start: 4, length: 3 })
  })

  it('puts a handle only on the outer ends of a run', () => {
    withNote()
    expect(noteCell(3, 2).querySelector('[data-grip="start"]')).toBeInTheDocument()
    expect(noteCell(3, 2).querySelector('[data-grip="end"]')).not.toBeInTheDocument()
    expect(noteCell(3, 3).querySelector('[data-grip]')).not.toBeInTheDocument()
    expect(noteCell(3, 4).querySelector('[data-grip="end"]')).toBeInTheDocument()
    expect(noteCell(3, 4).querySelector('[data-grip="start"]')).not.toBeInTheDocument()
  })

  it('dragging the middle moves it without changing its length', () => {
    withNote()
    fireEvent.pointerDown(noteCell(3, 3))
    dragOver([noteCell(3, 6)])
    fireEvent.pointerUp(noteCell(3, 6))

    expect(notes()[0]).toMatchObject({ start: 5, length: 3 })
  })

  it('dragging the middle to another row changes its pitch', () => {
    withNote()
    fireEvent.pointerDown(noteCell(3, 3))
    dragOver([noteCell(6, 3)])
    fireEvent.pointerUp(noteCell(6, 3))

    expect(notes()[0]).toMatchObject({ pitch: 6, start: 2, length: 3 })
  })

  it('shows the edit before it is committed, and only once', () => {
    withNote()
    fireEvent.pointerDown(noteCell(3, 3))
    dragOver([noteCell(3, 6)])

    // Drawn in the new place...
    expect(noteCell(3, 5).className).toContain('note--draft')
    // ...and gone from the old one, so it moves rather than clones.
    expect(noteCell(3, 2).className).not.toContain('note--on')
    // Nothing is stored until the finger lifts.
    expect(notes()[0]).toMatchObject({ start: 2 })
  })

  /** A note of one step, on row 3. */
  function short(step: number) {
    usePatternStore.setState({
      pattern: addNote(createEmptyPattern(), { pitch: 3, start: step, length: 1 }),
    })
    render(<Grid />)
  }

  // A one-step note is its own start and its own end, so it carries both
  // handles -- and, between them, a middle it never used to have.
  it('a one-step note grows from either handle', () => {
    short(8)
    fireEvent.pointerDown(grip(noteCell(3, 8), 'end'))
    dragOver([noteCell(3, 10)])
    fireEvent.pointerUp(noteCell(3, 10))
    expect(notes()[0]).toMatchObject({ start: 8, length: 3 })
  })

  it('a one-step note grows backwards from its start handle', () => {
    short(8)
    fireEvent.pointerDown(grip(noteCell(3, 8), 'start'))
    dragOver([noteCell(3, 5)])
    fireEvent.pointerUp(noteCell(3, 5))
    expect(notes()[0]).toMatchObject({ start: 5, length: 4 })
  })

  // This is what the handles are for: it used to be resizable from anywhere on
  // it, and movable from nowhere.
  it('a one-step note moves when dragged by its middle', () => {
    short(8)
    fireEvent.pointerDown(noteCell(3, 8))
    dragOver([noteCell(3, 12)])
    fireEvent.pointerUp(noteCell(3, 12))
    expect(notes()[0]).toMatchObject({ start: 12, length: 1 })
  })

  it('a two-step note moves by its middle too, having no middle cell', () => {
    usePatternStore.setState({
      pattern: addNote(createEmptyPattern(), { pitch: 3, start: 4, length: 2 }),
    })
    render(<Grid />)

    fireEvent.pointerDown(noteCell(3, 5))
    dragOver([noteCell(3, 9)])
    fireEvent.pointerUp(noteCell(3, 9))
    expect(notes()[0]).toMatchObject({ start: 8, length: 2 })
  })

  it('an edit never leaves a second copy behind', () => {
    withNote()
    fireEvent.pointerDown(noteCell(3, 3))
    dragOver([noteCell(3, 6)])
    fireEvent.pointerUp(noteCell(3, 6))

    expect(notes()).toHaveLength(1)
  })
})

describe('hearing a note as it is placed', () => {
  function draw(pitch: number, start: number, end: number) {
    fireEvent.pointerDown(noteCell(pitch, start))
    if (end !== start) dragOver([noteCell(pitch, end)])
    fireEvent.pointerUp(noteCell(pitch, end))
  }

  it('plays it, so you hear the pitch you just drew', async () => {
    render(<Grid />)
    draw(3, 2, 2)
    await settle()

    // The lead is one oscillator plus a sub an octave down.
    expect(mock.oscillators).toHaveLength(2)
  })

  it('plays a short version however long the note is', async () => {
    render(<Grid />)
    draw(3, 2, 6)
    await settle()
    draw(5, 2, 2)
    await settle()

    expect(mock.oscillators).toHaveLength(4)
    // A five-step note and a one-step note audition identically.
    expect(voiceLength(0)).toBeCloseTo(voiceLength(2))
  })

  it('stays quiet while the song is playing, since the note will sound in place', async () => {
    usePatternStore.setState({ isPlaying: true })
    render(<Grid />)
    draw(3, 2, 4)
    await settle()

    expect(mock.oscillators).toHaveLength(0)
    // The note was still placed.
    expect(notes()).toHaveLength(1)
  })

  it('stays quiet when the melody is muted', async () => {
    usePatternStore.setState({
      pattern: {
        ...usePatternStore.getState().pattern,
        melody: { ...usePatternStore.getState().pattern.melody, muted: true },
      },
    })
    render(<Grid />)
    draw(3, 2, 2)
    await settle()

    expect(mock.oscillators).toHaveLength(0)
  })

  it('plays the note again after an edit, at the new pitch', async () => {
    usePatternStore.setState({
      pattern: addNote(createEmptyPattern(), { pitch: 3, start: 2, length: 3 }),
    })
    render(<Grid />)
    fireEvent.pointerDown(noteCell(3, 3))
    dragOver([noteCell(6, 3)])
    fireEvent.pointerUp(noteCell(6, 3))
    await settle()

    expect(mock.oscillators).toHaveLength(2)
  })
})

describe('removing notes', () => {
  it('a tap on a note deletes it', () => {
    usePatternStore.setState({
      pattern: addNote(createEmptyPattern(), { pitch: 3, start: 2, length: 3 }),
    })
    render(<Grid />)
    fireEvent.pointerDown(noteCell(3, 3))
    fireEvent.pointerUp(noteCell(3, 3))

    expect(notes()).toEqual([])
  })

  it('a drag that returns to where it started is an edit, not a delete', () => {
    usePatternStore.setState({
      pattern: addNote(createEmptyPattern(), { pitch: 3, start: 2, length: 3 }),
    })
    render(<Grid />)
    fireEvent.pointerDown(noteCell(3, 3))
    dragOver([noteCell(3, 6), noteCell(3, 3)])
    fireEvent.pointerUp(noteCell(3, 3))

    expect(notes()).toHaveLength(1)
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

  it('picks the sound the melody is played with', () => {
    render(<Grid />)
    fireEvent.change(screen.getByLabelText('Melody sound'), { target: { value: 'bells' } })

    expect(usePatternStore.getState().pattern.melody.voiceId).toBe('bells')
  })

  it('offers every sound in the kit, showing the one in use', () => {
    render(<Grid />)
    const picker = screen.getByLabelText<HTMLSelectElement>('Melody sound')

    expect([...picker.options].map((option) => option.value)).toEqual(MELODY_VOICE_IDS)
    expect(picker.value).toBe('lead')
  })

  // The sound is part of the beat, so it has to be reachable without
  // unfolding the roll, exactly like the mute and the fader beside it.
  it('keeps the picker reachable while the section is collapsed', () => {
    useSettingsStore.setState({ melodyOpen: false })
    render(<Grid />)

    expect(screen.getByLabelText('Melody sound')).toBeInTheDocument()
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
