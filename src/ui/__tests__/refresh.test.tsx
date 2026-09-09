import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { RefreshButton } from '../Refresh'
import { usePatternStore } from '../../state/patternStore'
import { useSongStore } from '../../state/songStore'
import { useLibraryStore } from '../../state/libraryStore'
import { createEmptyPattern, setStep, type Pattern } from '../../state/schema'
import { addClip, addRow, createEmptySong, type Song } from '../../state/song'

const reload = vi.fn()
// Typed by what it spies on. The bare ReturnType<typeof vi.spyOn> is the
// unparameterised spy, whose call signature does not match window.confirm's --
// which `tsc -b` rejects, and so the build rejected it too.
let confirm: MockInstance<typeof window.confirm>

/** The beat and the song as the library has them: nothing unsaved anywhere. */
function saved(): { pattern: Pattern; song: Song } {
  const pattern: Pattern = { ...createEmptyPattern('Boom Bap'), id: 'boom' }
  const song: Song = { ...addClip(addRow(createEmptySong('Opener'), 'boom'), 0, { start: 0, length: 1 }), id: 'opener' }
  return { pattern, song }
}

function setUp({ pattern, song }: { pattern?: Pattern; song?: Song } = {}) {
  const library = saved()

  useLibraryStore.setState({
    patterns: [library.pattern],
    patternsById: new Map([[library.pattern.id, library.pattern]]),
    songs: [library.song],
    loading: false,
    error: null,
  })
  usePatternStore.setState({
    pattern: pattern ?? library.pattern,
    preview: null,
    isPlaying: false,
  })
  useSongStore.setState({ song: song ?? library.song, preview: null, isPlaying: false })
}

function press() {
  render(<RefreshButton />)
  fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
}

/** What the confirm was actually asked, so the wording can be checked. */
function asked(): string {
  return confirm.mock.calls[0]?.[0] as string
}

beforeEach(() => {
  reload.mockClear()
  confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...window.location, reload },
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('the refresh button', () => {
  it('reloads without asking when there is nothing to lose', () => {
    setUp()
    press()

    expect(confirm).not.toHaveBeenCalled()
    expect(reload).toHaveBeenCalled()
  })

  it('asks before throwing away an edited beat', () => {
    setUp({ pattern: setStep({ ...createEmptyPattern('Boom Bap'), id: 'boom' }, 0, 0, 1) })
    press()

    expect(asked()).toContain('The beat "Boom Bap" has changes you have not saved')
    expect(reload).toHaveBeenCalled()
  })

  it('stays put when the warning is declined', () => {
    confirm.mockReturnValue(false)
    setUp({ pattern: setStep({ ...createEmptyPattern('Boom Bap'), id: 'boom' }, 0, 0, 1) })
    press()

    expect(confirm).toHaveBeenCalled()
    expect(reload).not.toHaveBeenCalled()
  })

  // A reload is not a navigation: it takes both halves of the app at once, and
  // the one you cannot see is the one you have forgotten about.
  it('names the song too, from the beat screen', () => {
    setUp({
      song: { ...addRow(createEmptySong('Opener'), 'boom'), id: 'opener' },
    })
    press()

    expect(asked()).toContain('The song "Opener" has changes')
  })

  it('names both when both have been edited', () => {
    setUp({
      pattern: setStep({ ...createEmptyPattern('Boom Bap'), id: 'boom' }, 0, 0, 1),
      song: { ...addRow(createEmptySong('Opener'), 'boom'), id: 'opener' },
    })
    press()

    expect(asked()).toContain('The beat "Boom Bap" and the song "Opener" have changes')
  })
})
