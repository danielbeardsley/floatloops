import { backupFileName, createBackup, parseBackup, type ParsedBackup } from '../state/backup'
import { useLibraryStore } from '../state/libraryStore'
import { usePatternStore } from '../state/patternStore'
import { preferencesOf, useSettingsStore } from '../state/settingsStore'
import { useSongStore } from '../state/songStore'
import { requestPersistence } from '../state/persistence'
import { exportLibrary, mergeLibrary, type MergeResult } from '../state/storage'
import { isUnsaved, songIsUnsaved } from './unsaved'

/**
 * Saving and loading the backup file, from the library screen.
 *
 * The file is the one copy of a library the browser cannot throw away, so
 * both directions are built to be done without thinking: saving is one tap,
 * and loading only ever adds to what is here.
 */

export type SaveOutcome = 'shared' | 'downloaded' | 'cancelled'

/**
 * A tablet or phone gets the share sheet, which is where "Save to Files" and
 * the cloud drives live -- and on an iPad running the installed app, a
 * download link opens a preview with nowhere to save it. A computer gets an
 * ordinary download, which is what it does well and the share sheet does not.
 */
function shouldShare(file: File): boolean {
  if (typeof navigator.canShare !== 'function' || typeof navigator.share !== 'function') return false
  if (!navigator.canShare({ files: [file] })) return false
  return typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches
}

function download(file: File) {
  const url = URL.createObjectURL(file)
  const link = document.createElement('a')
  link.href = url
  link.download = file.name
  document.body.append(link)
  link.click()
  link.remove()
  // Revoking straight away can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

export async function saveBackup(): Promise<SaveOutcome> {
  const library = await exportLibrary()
  const text = createBackup(library, preferencesOf(useSettingsStore.getState()))
  const file = new File([text], backupFileName(), { type: 'application/json' })

  if (shouldShare(file)) {
    try {
      await navigator.share({ files: [file], title: 'FloatLoops backup' })
      return 'shared'
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled'
      // Sharing can be refused for reasons of its own; a download still works.
    }
  }

  download(file)
  return 'downloaded'
}

export type LoadOutcome = { merge: MergeResult; skipped: number }

/**
 * Merges a backup in, then brings the open beat and song along with it.
 *
 * The editors hold their own copies, and one left on the old version would
 * put it straight back over the restored one on the next save. So a beat or
 * song open with no edits of its own follows the backup; one with edits is
 * left alone, those edits being newer than anything in the file.
 */
export async function loadBackup(parsed: ParsedBackup): Promise<LoadOutcome> {
  const before = useLibraryStore.getState()
  const { pattern } = usePatternStore.getState()
  const { song } = useSongStore.getState()
  const savedPattern = before.patternsById.get(pattern.id)
  const savedSong = before.songs.find((item) => item.id === song.id)
  const beatInSync = savedPattern !== undefined && !isUnsaved(pattern, savedPattern)
  const songInSync = savedSong !== undefined && !songIsUnsaved(song, savedSong)

  const merge = await mergeLibrary(parsed.library)
  void requestPersistence()
  if (parsed.preferences) useSettingsStore.getState().replaceAll(parsed.preferences)
  await useLibraryStore.getState().refresh()

  const after = useLibraryStore.getState()
  const freshPattern = after.patternsById.get(pattern.id)
  if (beatInSync && freshPattern && freshPattern.updatedAt > savedPattern.updatedAt) {
    // Only the beat changes; how it was opened -- from which song, at which
    // bar -- is still true.
    usePatternStore.setState({ pattern: freshPattern })
  }
  const freshSong = after.songs.find((item) => item.id === song.id)
  if (songInSync && freshSong && freshSong.updatedAt > savedSong.updatedAt) {
    useSongStore.setState({ song: freshSong })
  }

  return { merge, skipped: parsed.skipped }
}

/** Blob.text() where there is one; FileReader for the browsers that predate it. */
export function readText(blob: Blob): Promise<string> {
  if (typeof blob.text === 'function') return blob.text()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error ?? new Error('Could not read that file.'))
    reader.readAsText(blob)
  })
}

export async function loadBackupFile(file: Blob): Promise<LoadOutcome> {
  return loadBackup(parseBackup(await readText(file)))
}

function plural(count: number, one: string, many = `${one}s`) {
  return `${count} ${count === 1 ? one : many}`
}

/** What a load did, in a sentence or two. */
export function describeLoad({ merge, skipped }: LoadOutcome): string {
  const { patterns, songs } = merge
  const parts: string[] = []

  const added = [
    patterns.added ? plural(patterns.added, 'beat') : '',
    songs.added ? plural(songs.added, 'song') : '',
  ].filter(Boolean)
  if (added.length) parts.push(`Added ${added.join(' and ')}.`)

  const updated = patterns.updated + songs.updated
  if (updated) {
    parts.push(`Updated ${updated} to ${updated === 1 ? 'a newer version' : 'newer versions'}.`)
  }

  if (!parts.length) parts.push('Everything in that backup is already here.')
  if (skipped) parts.push(`${plural(skipped, 'thing')} in the file could not be read.`)

  return parts.join(' ')
}
