import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { LibraryScreen } from '../LibraryScreen'
import { describeLoad, loadBackup, readText } from '../backup'
import { createBackup, parseBackup } from '../../state/backup'
import { useLibraryStore } from '../../state/libraryStore'
import { usePatternStore } from '../../state/patternStore'
import { useSettingsStore } from '../../state/settingsStore'
import { useSongStore } from '../../state/songStore'
import { closeStorage, getPattern, listPatterns, savePattern, saveSong } from '../../state/storage'
import { DEFAULT_PREFERENCES } from '../../state/preferences'
import { createEmptyPattern, demoPattern, toggleStep } from '../../state/schema'
import { addRow, createEmptySong } from '../../state/song'
import { resetTransport } from '../../state/transport'
import { resetEngine } from '../../audio/context'

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => vi.fn() }
})

beforeEach(async () => {
  await closeStorage()
  await new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase('floatloops')
    request.onsuccess = () => resolve()
    request.onerror = () => resolve()
    request.onblocked = () => resolve()
  })
  window.localStorage.clear()
  useLibraryStore.setState({ patterns: [], patternsById: new Map(), songs: [], loading: false, error: null })
  usePatternStore.setState({ pattern: demoPattern(), preview: null, isPlaying: false })
  useSongStore.setState({ song: createEmptySong(), preview: null, isPlaying: false })
  useSettingsStore.getState().replaceAll(DEFAULT_PREFERENCES)
})

afterEach(() => {
  resetTransport()
  resetEngine()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function backupOf(patterns: ReturnType<typeof createEmptyPattern>[], songs = [] as ReturnType<typeof createEmptySong>[]) {
  return parseBackup(createBackup({ patterns, songs }, { ...DEFAULT_PREFERENCES, autoSave: true }))
}

describe('loading a backup', () => {
  it('adds to the library and shows it straight away', async () => {
    await savePattern({ ...createEmptyPattern('Mine'), id: 'mine' })
    await useLibraryStore.getState().refresh()

    await loadBackup(backupOf([{ ...createEmptyPattern('Theirs'), id: 'theirs' }]))

    const names = useLibraryStore.getState().patterns.map((p) => p.name).sort()
    expect(names).toEqual(['Mine', 'Theirs'])
  })

  it('restores the preferences it carries', async () => {
    await loadBackup(backupOf([]))
    expect(useSettingsStore.getState().autoSave).toBe(true)
  })

  it('brings an open beat with no edits along to the newer copy', async () => {
    const open = await savePattern({ ...createEmptyPattern('Old'), id: 'beat' })
    await useLibraryStore.getState().refresh()
    usePatternStore.getState().setPattern(open, 'some-song', 3)

    await loadBackup(backupOf([{ ...open, name: 'Restored', updatedAt: open.updatedAt + 1000 }]))

    const state = usePatternStore.getState()
    expect(state.pattern.name).toBe('Restored')
    // How the beat was opened is still true of it.
    expect(state.fromSong).toBe('some-song')
    expect(state.atBar).toBe(3)
  })

  it('leaves an open beat with edits of its own alone', async () => {
    const open = await savePattern({ ...createEmptyPattern('Old'), id: 'beat' })
    await useLibraryStore.getState().refresh()
    usePatternStore.getState().setPattern(toggleStep(open, 0, 0))

    await loadBackup(backupOf([{ ...open, name: 'Restored', updatedAt: open.updatedAt + 1000 }]))

    expect(usePatternStore.getState().pattern.name).toBe('Old')
    expect((await getPattern('beat'))?.name).toBe('Restored')
  })

  it('brings an open song with no edits along too', async () => {
    const open = await saveSong({ ...addRow(createEmptySong('Old'), 'beat'), id: 'tune' })
    await useLibraryStore.getState().refresh()
    useSongStore.getState().setSong(open)

    await loadBackup(backupOf([], [{ ...open, name: 'Restored', updatedAt: open.updatedAt + 1000 }]))

    expect(useSongStore.getState().song.name).toBe('Restored')
  })
})

describe('what a load says it did', () => {
  const none = { added: 0, updated: 0, unchanged: 0 }

  it('names what was added', () => {
    const text = describeLoad({
      merge: { patterns: { ...none, added: 3 }, songs: { ...none, added: 1 } },
      skipped: 0,
    })
    expect(text).toBe('Added 3 beats and 1 song.')
  })

  it('counts what was brought up to date', () => {
    const text = describeLoad({
      merge: { patterns: { ...none, updated: 1 }, songs: { ...none, updated: 1 } },
      skipped: 0,
    })
    expect(text).toBe('Updated 2 to newer versions.')
  })

  it('says when there was nothing new, and owns up to what it skipped', () => {
    const text = describeLoad({ merge: { patterns: { ...none, unchanged: 2 }, songs: none }, skipped: 1 })
    expect(text).toBe('Everything in that backup is already here. 1 thing in the file could not be read.')
  })
})

describe('the backup section', () => {
  function renderLibrary() {
    return render(
      <MemoryRouter>
        <LibraryScreen />
      </MemoryRouter>,
    )
  }

  it('saves a file that loads back', async () => {
    await savePattern({ ...demoPattern(), name: 'Boom Bap', id: 'boom' })
    const files: Blob[] = []
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: (blob: Blob) => {
        files.push(blob)
        return 'blob:backup'
      },
      revokeObjectURL: () => {},
    })
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    renderLibrary()
    fireEvent.click(await screen.findByRole('button', { name: 'Save backup' }))

    expect(await screen.findByText(/backup saved/i)).toBeInTheDocument()
    expect(click).toHaveBeenCalledOnce()
    expect((click.mock.contexts[0] as HTMLAnchorElement).download).toMatch(
      /^floatloops-backup-\d{4}-\d{2}-\d{2}\.json$/,
    )

    const read = parseBackup(await readText(files[0]))
    expect(read.library.patterns.map((p) => p.name)).toEqual(['Boom Bap'])
  })

  it('loads a picked file and says what it did', async () => {
    const text = createBackup(
      { patterns: [{ ...createEmptyPattern('From Before'), id: 'before' }], songs: [] },
      DEFAULT_PREFERENCES,
    )

    renderLibrary()
    fireEvent.change(screen.getByLabelText('Backup file'), {
      target: { files: [new File([text], 'backup.json', { type: 'application/json' })] },
    })

    expect(await screen.findByText('Added 1 beat.')).toBeInTheDocument()
    expect(await screen.findByText('From Before')).toBeInTheDocument()
    expect((await listPatterns()).map((p) => p.id)).toEqual(['before'])
  })

  it('says so when the file is not a backup', async () => {
    renderLibrary()
    fireEvent.change(screen.getByLabelText('Backup file'), {
      target: { files: [new File(['shopping list'], 'notes.txt')] },
    })

    expect(await screen.findByText(/not a FloatLoops backup/)).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Load backup' })).toBeEnabled())
  })
})
