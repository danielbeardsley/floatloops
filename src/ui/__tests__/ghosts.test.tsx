import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { Grid } from '../Grid'
import { usePatternStore } from '../../state/patternStore'
import { useSongStore } from '../../state/songStore'
import { useLibraryStore } from '../../state/libraryStore'
import { useSettingsStore } from '../../state/settingsStore'
import { resetTransport } from '../../state/transport'
import { resetEngine, setContextFactory } from '../../audio/context'
import { addNote, createEmptyPattern, setStep, type Pattern } from '../../state/schema'
import { addClip, addRow, createEmptySong, type Song } from '../../state/song'
import { STEPS_PER_MEASURE } from '../../audio/timing'
import { MockAudioContext, asAudioContext } from '../../test/mockAudioContext'

const KICK = 0
const SNARE = 1

/** The beat on screen: empty, so anything drawn in it came from elsewhere. */
const MINE: Pattern = { ...createEmptyPattern('Mine'), id: 'mine' }

function beat(id: string, build: (pattern: Pattern) => Pattern, measures = 1): Pattern {
  return build({ ...createEmptyPattern(id, measures), id })
}

function cellFor(track: number, step: number): HTMLElement {
  const cell = document.querySelector<HTMLElement>(`[data-track="${track}"][data-step="${step}"]`)
  if (!cell) throw new Error(`no cell at ${track},${step}`)
  return cell
}

function noteCellFor(pitch: number, step: number): HTMLElement {
  const cell = document.querySelector<HTMLElement>(`[data-pitch="${pitch}"][data-step="${step}"]`)
  if (!cell) throw new Error(`no note cell at ${pitch},${step}`)
  return cell
}

function ghostIn(cell: HTMLElement): HTMLElement | null {
  return cell.querySelector<HTMLElement>('.ghost')
}

/** The beat being edited, plus whatever else the song is playing at the time. */
function setUp({
  others = [] as Pattern[],
  song,
  atBar = 0,
  mine = MINE,
  fromSong = true,
}: {
  others?: Pattern[]
  song?: Song
  atBar?: number | null
  mine?: Pattern
  fromSong?: boolean
} = {}) {
  const patterns = [mine, ...others]
  useLibraryStore.setState({
    patterns,
    patternsById: new Map(patterns.map((pattern) => [pattern.id, pattern])),
    songs: [],
    loading: false,
    error: null,
  })

  const arranged =
    song ??
    others.reduce(
      (built, other, index) => addClip(addRow(built, other.id), index + 1, { start: 0, length: 4 }),
      addClip(addRow(createEmptySong('Opener'), mine.id), 0, { start: 0, length: 4 }),
    )

  useSongStore.setState({ song: arranged, preview: null, isPlaying: false })
  usePatternStore.setState({
    pattern: mine,
    preview: null,
    isPlaying: false,
    fromSong: fromSong ? arranged.id : null,
    atBar,
    hiddenOthers: [],
  })

  return arranged
}

beforeEach(() => {
  vi.useFakeTimers()
  resetTransport()
  resetEngine()
  setContextFactory(() => asAudioContext(new MockAudioContext()))
  useSettingsStore.setState({ followPlayhead: true, drumsOpen: true, melodyOpen: true, showOthers: true })
})

afterEach(() => {
  resetTransport()
  resetEngine()
  vi.useRealTimers()
})

describe('the rest of the song, showing through', () => {
  it('puts another beat’s kick in your kick row', () => {
    setUp({ others: [beat('bass', (p) => setStep(p, KICK, 4, 1))] })
    render(<Grid />)

    expect(ghostIn(cellFor(KICK, 4))).not.toBeNull()
    expect(ghostIn(cellFor(KICK, 0))).toBeNull()
  })

  it('keeps them out of the row they do not belong to', () => {
    setUp({ others: [beat('bass', (p) => setStep(p, SNARE, 4, 1))] })
    render(<Grid />)

    expect(ghostIn(cellFor(SNARE, 4))).not.toBeNull()
    expect(ghostIn(cellFor(KICK, 4))).toBeNull()
  })

  it('lands another beat’s notes on the pitches they are written on', () => {
    setUp({ others: [beat('tune', (p) => addNote(p, { pitch: 3, start: 2, length: 2 }))] })
    render(<Grid />)

    expect(ghostIn(noteCellFor(3, 2))).not.toBeNull()
    expect(ghostIn(noteCellFor(3, 3))).not.toBeNull()
    expect(ghostIn(noteCellFor(2, 2))).toBeNull()
  })

  it('draws a held note as one run rather than a row of blocks', () => {
    setUp({ others: [beat('tune', (p) => addNote(p, { pitch: 3, start: 2, length: 2 }))] })
    render(<Grid />)

    expect(ghostIn(noteCellFor(3, 2))?.className).toContain('ghost--start')
    expect(ghostIn(noteCellFor(3, 3))?.className).toContain('ghost--end')
  })

  it('shows what plays at the place you came to, not at the start of the song', () => {
    const bass = beat(
      'bass',
      (p) => setStep(setStep(p, KICK, 0, 1), KICK, STEPS_PER_MEASURE + 8, 1),
      2,
    )
    setUp({ others: [bass], atBar: 1 })
    render(<Grid />)

    expect(ghostIn(cellFor(KICK, 8))).not.toBeNull()
    expect(ghostIn(cellFor(KICK, 0))).toBeNull()
  })

  /*
   * The step both beats land on is the collision being looked for, so it is
   * the last thing that should be swallowed by your own hit. The outline
   * switches to the background colour over a filled cell; what matters here is
   * that it is still drawn at all.
   */
  it('is still there under a step you have drawn yourself', () => {
    const mine = setStep({ ...createEmptyPattern('Mine'), id: 'mine' }, KICK, 4, 1)
    setUp({ mine, others: [beat('bass', (p) => setStep(p, KICK, 4, 1))] })
    render(<Grid />)

    expect(cellFor(KICK, 4).className).toContain('cell--on')
    expect(ghostIn(cellFor(KICK, 4))).not.toBeNull()
  })

  it('says so to a screen reader, which cannot see a hollow outline', () => {
    setUp({ others: [beat('bass', (p) => setStep(p, KICK, 4, 1))] })
    render(<Grid />)

    expect(cellFor(KICK, 4).getAttribute('aria-label')).toBe(
      'Kick step 5, another beat plays here',
    )
  })

  it('leaves a hidden row out', () => {
    const song = setUp({ others: [beat('bass', (p) => setStep(p, KICK, 4, 1))] })
    render(<Grid />)

    act(() => usePatternStore.getState().toggleOther(song.rows[1].id))
    expect(ghostIn(cellFor(KICK, 4))).toBeNull()

    act(() => usePatternStore.getState().toggleOther(song.rows[1].id))
    expect(ghostIn(cellFor(KICK, 4))).not.toBeNull()
  })
})

describe('the Others switch', () => {
  it('is offered when the beat is being edited at a place in a song', () => {
    setUp({ others: [beat('bass', (p) => setStep(p, KICK, 4, 1))] })
    render(<Grid />)
    expect(screen.getByRole('button', { name: 'Others' })).toBeInTheDocument()
  })

  it('stays away from a beat being edited on its own', () => {
    setUp({ others: [beat('bass', (p) => setStep(p, KICK, 4, 1))], fromSong: false })
    render(<Grid />)
    expect(screen.queryByRole('button', { name: 'Others' })).not.toBeInTheDocument()
  })

  it('takes the rest of the song away with it', () => {
    setUp({ others: [beat('bass', (p) => setStep(p, KICK, 4, 1))] })
    render(<Grid />)

    fireEvent.click(screen.getByRole('button', { name: 'Others' }))
    expect(ghostIn(cellFor(KICK, 4))).toBeNull()
    expect(useSettingsStore.getState().showOthers).toBe(false)
  })
})

describe('a pass the song cuts short', () => {
  it('stripes the steps of your beat that do not play here', () => {
    const mine: Pattern = { ...createEmptyPattern('Mine', 2), id: 'mine' }
    const song = addClip(addRow(createEmptySong('Opener'), mine.id), 0, { start: 0, length: 3 })
    setUp({ mine, song, atBar: 2 })
    render(<Grid />)

    expect(cellFor(KICK, 0).className).not.toContain('cell--unplayed')
    expect(cellFor(KICK, STEPS_PER_MEASURE).className).toContain('cell--unplayed')
  })
})
