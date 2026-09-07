import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { Grid } from '../Grid'
import { readTarget } from '../useStepPainter'
import { usePatternStore } from '../../state/patternStore'
import { resetTransport } from '../../state/transport'
import { resetEngine, setContextFactory } from '../../audio/context'
import { createEmptyPattern, demoPattern, isStepOn } from '../../state/schema'
import { loadPreferences } from '../../state/preferences'
import { STEPS_PER_MEASURE } from '../../audio/timing'
import { KIT } from '../../audio/kit'
import { useSettingsStore } from '../../state/settingsStore'
import { MockAudioContext, asAudioContext } from '../../test/mockAudioContext'

let mock: MockAudioContext

/** Auditioning unlocks the context first, so let the promise settle. */
async function settle() {
  await act(async () => {})
}

function cellFor(track: number, step: number): HTMLElement {
  const cell = document.querySelector<HTMLElement>(`[data-track="${track}"][data-step="${step}"]`)
  if (!cell) throw new Error(`no cell at ${track},${step}`)
  return cell
}

function stepValue(track: number, step: number): number {
  return usePatternStore.getState().pattern.tracks[track].steps[step]
}

beforeEach(() => {
  vi.useFakeTimers()
  resetTransport()
  resetEngine()
  mock = new MockAudioContext()
  setContextFactory(() => asAudioContext(mock))
  usePatternStore.setState({ pattern: createEmptyPattern('Test'), isPlaying: false })
  useSettingsStore.setState({ followPlayhead: true, melodyOpen: false, drumsOpen: true })
})

afterEach(() => {
  resetTransport()
  resetEngine()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('Grid layout', () => {
  it('draws a row per kit voice', () => {
    render(<Grid />)
    for (const voice of KIT) {
      expect(screen.getByText(voice.name)).toBeInTheDocument()
    }
  })

  it('draws a cell per track per step', () => {
    render(<Grid />)
    expect(document.querySelectorAll('.cell')).toHaveLength(KIT.length * STEPS_PER_MEASURE)
  })

  it('tags cells with their coordinates, which is how painting and the playhead find them', () => {
    render(<Grid />)
    const cell = cellFor(2, 5)
    expect(cell.dataset.track).toBe('2')
    expect(cell.dataset.step).toBe('5')
  })

  it('numbers each measure', () => {
    render(<Grid />)
    expect(screen.getByText('1')).toBeInTheDocument()
  })
})

describe('tapping cells', () => {
  it('turns a step on', () => {
    render(<Grid />)
    fireEvent.pointerDown(cellFor(0, 4))
    expect(isStepOn(usePatternStore.getState().pattern.tracks[0], 4)).toBe(true)
  })

  it('turns it off again', () => {
    render(<Grid />)
    fireEvent.pointerDown(cellFor(0, 4))
    fireEvent.pointerUp(cellFor(0, 4))
    fireEvent.pointerDown(cellFor(0, 4))
    expect(isStepOn(usePatternStore.getState().pattern.tracks[0], 4)).toBe(false)
  })

  it('leaves other steps alone', () => {
    render(<Grid />)
    fireEvent.pointerDown(cellFor(0, 4))
    expect(isStepOn(usePatternStore.getState().pattern.tracks[0], 5)).toBe(false)
    expect(isStepOn(usePatternStore.getState().pattern.tracks[1], 4)).toBe(false)
  })
})

describe('hearing a drum as it is placed', () => {
  it('plays it, so you learn which row is which', async () => {
    render(<Grid />)
    fireEvent.pointerDown(cellFor(0, 4))
    await settle()

    // The kick is a single oscillator.
    expect(mock.oscillators).toHaveLength(1)
  })

  it('stays quiet while the song is playing, since the step will sound in place', async () => {
    usePatternStore.setState({ isPlaying: true })
    render(<Grid />)
    fireEvent.pointerDown(cellFor(0, 4))
    await settle()

    expect(mock.oscillators).toHaveLength(0)
    // The step was still placed.
    expect(isStepOn(usePatternStore.getState().pattern.tracks[0], 4)).toBe(true)
  })

  it('stays quiet on a muted track', async () => {
    render(<Grid />)
    fireEvent.click(screen.getByLabelText(`Mute ${KIT[0].name}`))
    fireEvent.pointerDown(cellFor(0, 4))
    await settle()

    expect(mock.oscillators).toHaveLength(0)
  })

  it('stays quiet when a step is being cleared rather than drawn', async () => {
    render(<Grid />)
    fireEvent.pointerDown(cellFor(0, 4))
    fireEvent.pointerUp(cellFor(0, 4))
    await settle()
    const afterDrawing = mock.oscillators.length

    fireEvent.pointerDown(cellFor(0, 4))
    await settle()
    expect(mock.oscillators).toHaveLength(afterDrawing)
  })
})

describe('drag to paint', () => {
  /**
   * Once the pointer is captured, move events keep reporting the cell the drag
   * started on, so the component has to ask the document what is under the
   * finger. Stubbing that is what these tests are really exercising.
   */
  function dragOver(cells: HTMLElement[]) {
    for (const cell of cells) {
      vi.stubGlobal('document', document)
      document.elementFromPoint = () => cell
      fireEvent.pointerMove(cell, { clientX: 1, clientY: 1 })
    }
  }

  it('fills every cell the finger passes over', () => {
    render(<Grid />)
    fireEvent.pointerDown(cellFor(0, 0))
    dragOver([cellFor(0, 1), cellFor(0, 2), cellFor(0, 3)])
    fireEvent.pointerUp(cellFor(0, 3))

    for (const step of [0, 1, 2, 3]) {
      expect(isStepOn(usePatternStore.getState().pattern.tracks[0], step)).toBe(true)
    }
  })

  it('erases when the drag starts on a filled cell', () => {
    render(<Grid />)
    // Draw a run, then drag back across it.
    fireEvent.pointerDown(cellFor(0, 0))
    dragOver([cellFor(0, 1)])
    fireEvent.pointerUp(cellFor(0, 1))

    fireEvent.pointerDown(cellFor(0, 0))
    dragOver([cellFor(0, 1)])
    fireEvent.pointerUp(cellFor(0, 1))

    expect(isStepOn(usePatternStore.getState().pattern.tracks[0], 0)).toBe(false)
    expect(isStepOn(usePatternStore.getState().pattern.tracks[0], 1)).toBe(false)
  })

  it('does not flip a cell twice within one drag', () => {
    render(<Grid />)
    fireEvent.pointerDown(cellFor(0, 0))
    dragOver([cellFor(0, 1), cellFor(0, 1), cellFor(0, 1)])
    fireEvent.pointerUp(cellFor(0, 1))
    expect(stepValue(0, 1)).toBe(1)
  })

  it('paints across tracks as well as steps', () => {
    render(<Grid />)
    fireEvent.pointerDown(cellFor(0, 0))
    dragOver([cellFor(1, 0)])
    fireEvent.pointerUp(cellFor(1, 0))
    expect(isStepOn(usePatternStore.getState().pattern.tracks[1], 0)).toBe(true)
  })

  it('ignores moves once the gesture has ended', () => {
    render(<Grid />)
    fireEvent.pointerDown(cellFor(0, 0))
    fireEvent.pointerUp(cellFor(0, 0))
    dragOver([cellFor(0, 5)])
    expect(isStepOn(usePatternStore.getState().pattern.tracks[0], 5)).toBe(false)
  })
})

describe('measures', () => {
  it('adds a measure, and every track grows with it', () => {
    render(<Grid />)
    fireEvent.click(screen.getByLabelText('Add a measure'))
    expect(document.querySelectorAll('.cell')).toHaveLength(KIT.length * 2 * STEPS_PER_MEASURE)
    expect(usePatternStore.getState().pattern.measures).toBe(2)
  })

  it('keeps what was already drawn', () => {
    render(<Grid />)
    fireEvent.pointerDown(cellFor(0, 3))
    fireEvent.click(screen.getByLabelText('Add a measure'))
    expect(isStepOn(usePatternStore.getState().pattern.tracks[0], 3)).toBe(true)
  })

  // It used to stop offering at eight, which is not long enough to write a
  // song in.
  it('keeps offering more past the eight bars it used to stop at', () => {
    render(<Grid />)
    const add = screen.getByLabelText('Add a measure')
    for (let i = 1; i < 12; i += 1) fireEvent.click(add)

    expect(usePatternStore.getState().pattern.measures).toBe(12)
    expect(add).not.toBeDisabled()
    expect(screen.getByLabelText('Go to measure 12')).toBeInTheDocument()
  })

})

describe('removing a measure', () => {
  function addOne() {
    fireEvent.click(screen.getByLabelText('Add a measure'))
  }

  it('offers nothing to remove while there is only one measure', () => {
    render(<Grid />)
    expect(screen.queryByLabelText(/^Remove measure/)).not.toBeInTheDocument()
  })

  it('offers a remove on each measure once there are two', () => {
    render(<Grid />)
    addOne()
    expect(screen.getByLabelText('Remove measure 1')).toBeInTheDocument()
    expect(screen.getByLabelText('Remove measure 2')).toBeInTheDocument()
  })

  it('drops an empty measure without asking', () => {
    const confirm = vi.spyOn(window, 'confirm')
    render(<Grid />)
    addOne()
    fireEvent.click(screen.getByLabelText('Remove measure 2'))

    expect(confirm).not.toHaveBeenCalled()
    expect(usePatternStore.getState().pattern.measures).toBe(1)
    expect(document.querySelectorAll('.cell')).toHaveLength(KIT.length * STEPS_PER_MEASURE)
  })

  it('asks before dropping a measure with something in it', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<Grid />)
    addOne()
    fireEvent.pointerDown(cellFor(0, STEPS_PER_MEASURE + 2))
    fireEvent.click(screen.getByLabelText('Remove measure 2'))

    expect(confirm).toHaveBeenCalled()
    expect(usePatternStore.getState().pattern.measures).toBe(2)
  })

  it('drops it when the question is answered yes', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<Grid />)
    addOne()
    fireEvent.pointerDown(cellFor(0, STEPS_PER_MEASURE + 2))
    fireEvent.click(screen.getByLabelText('Remove measure 2'))

    expect(usePatternStore.getState().pattern.measures).toBe(1)
  })

  it('closes the gap rather than clearing everything after it', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<Grid />)
    addOne()
    // Mark the second measure, then drop the first.
    fireEvent.pointerDown(cellFor(0, STEPS_PER_MEASURE + 3))
    fireEvent.click(screen.getByLabelText('Remove measure 1'))

    expect(isStepOn(usePatternStore.getState().pattern.tracks[0], 3)).toBe(true)
  })
})

describe('following the playhead', () => {
  it('is on to begin with', () => {
    render(<Grid />)
    expect(screen.getByRole('button', { name: 'Follow' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('can be switched off', () => {
    render(<Grid />)
    fireEvent.click(screen.getByRole('button', { name: 'Follow' }))

    expect(useSettingsStore.getState().followPlayhead).toBe(false)
    expect(screen.getByRole('button', { name: 'Follow' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('can be switched back on', () => {
    render(<Grid />)
    fireEvent.click(screen.getByRole('button', { name: 'Follow' }))
    fireEvent.click(screen.getByRole('button', { name: 'Follow' }))
    expect(useSettingsStore.getState().followPlayhead).toBe(true)
  })
})

describe('track controls', () => {
  it('mutes a track', () => {
    render(<Grid />)
    fireEvent.click(screen.getByLabelText(`Mute ${KIT[0].name}`))
    expect(usePatternStore.getState().pattern.tracks[0].muted).toBe(true)
  })

  it('sets a track volume', () => {
    render(<Grid />)
    fireEvent.change(screen.getByLabelText(`${KIT[1].name} volume`), { target: { value: '0.25' } })
    expect(usePatternStore.getState().pattern.tracks[1].level).toBeCloseTo(0.25)
  })
})

describe('readTarget', () => {
  it('reads coordinates off a cell', () => {
    render(<Grid />)
    expect(readTarget(cellFor(3, 7))).toEqual({ trackIndex: 3, stepIndex: 7 })
  })

  it('returns nothing for anything that is not a cell', () => {
    render(<Grid />)
    expect(readTarget(null)).toBeNull()
    expect(readTarget(screen.getByTestId('grid'))).toBeNull()
  })
})

/** Folded away by the same header the piano roll uses. */
describe('the drums section', () => {
  const toggle = () => screen.getByRole('button', { name: /^drums/i })

  it('is open to begin with, being the main event', () => {
    render(<Grid />)
    expect(toggle()).toHaveAttribute('aria-expanded', 'true')
    expect(document.querySelectorAll('[data-track]')).toHaveLength(
      KIT.length * STEPS_PER_MEASURE,
    )
  })

  it('folds the drum rows away', () => {
    render(<Grid />)
    fireEvent.click(toggle())

    expect(document.querySelectorAll('[data-track]')).toHaveLength(0)
    expect(toggle()).toHaveAttribute('aria-expanded', 'false')
  })

  it('mutes every drum from the section header', () => {
    render(<Grid />)
    fireEvent.click(screen.getByLabelText('Mute drums'))

    expect(usePatternStore.getState().pattern.drumsMuted).toBe(true)
    expect(screen.getByLabelText('Unmute drums')).toBeInTheDocument()
  })

  // The drums go on playing while the section is folded, so the control that
  // stops them has to stay reachable, exactly as the melody's does.
  it('keeps the mute reachable while the section is collapsed', () => {
    render(<Grid />)
    fireEvent.click(toggle())

    expect(screen.getByLabelText('Mute drums')).toBeInTheDocument()
  })

  it('leaves the ruler and the melody where they are', () => {
    useSettingsStore.setState({ melodyOpen: true })
    render(<Grid />)
    fireEvent.click(toggle())

    expect(screen.getByRole('button', { name: 'Go to measure 1' })).toBeInTheDocument()
    expect(document.querySelectorAll('[data-pitch]').length).toBeGreaterThan(0)
  })

  // Collapsing is only ever visual, so a silent gap where nine rows were would
  // be misleading about what is playing.
  it('says how many drums are in use while it is collapsed', () => {
    usePatternStore.setState({ pattern: demoPattern() })
    render(<Grid />)
    fireEvent.click(toggle())

    // The demo beat uses kick, snare and both hats.
    expect(toggle()).toHaveTextContent('4')
  })

  it('counts nothing for an empty beat', () => {
    render(<Grid />)
    fireEvent.click(toggle())
    expect(toggle()).toHaveTextContent(/^\s*▸\s*Drums\s*$/)
  })

  it('remembers the choice for next time', () => {
    render(<Grid />)
    fireEvent.click(toggle())
    expect(useSettingsStore.getState().drumsOpen).toBe(false)
    expect(loadPreferences().drumsOpen).toBe(false)
  })

  it('does not disturb the other preferences', () => {
    render(<Grid />)
    fireEvent.click(toggle())
    expect(loadPreferences().followPlayhead).toBe(true)
    expect(loadPreferences().melodyOpen).toBe(false)
  })
})
