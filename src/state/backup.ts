import { migratePattern, migrateSong } from './migrate'
import { readPreferences, type Preferences } from './preferences'
import type { Library } from './storage'
import type { Pattern } from './schema'
import type { Song } from './song'

/**
 * The backup file: every beat, every song and the device's preferences, in one
 * JSON file the user keeps somewhere the browser cannot clear.
 *
 * The records inside are stored exactly as they are saved, and read back
 * through the same migrations as the database. So a backup made by an older
 * build loads in a newer one for the same reason an old save does, and there
 * is only the envelope's own version to keep track of here.
 */

export const BACKUP_APP = 'floatloops'

/** The envelope's version. Bump it only for a change readers must refuse. */
export const BACKUP_FORMAT = 1

export type BackupFile = {
  app: typeof BACKUP_APP
  format: number
  exportedAt: number
  patterns: Pattern[]
  songs: Song[]
  preferences: Preferences
}

export function createBackup(library: Library, preferences: Preferences, now = Date.now()): string {
  const file: BackupFile = {
    app: BACKUP_APP,
    format: BACKUP_FORMAT,
    exportedAt: now,
    patterns: library.patterns,
    songs: library.songs,
    preferences,
  }
  return JSON.stringify(file)
}

/** The day it was made, by the device's own calendar, so the files sort. */
export function backupFileName(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `floatloops-backup-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.json`
}

/** A file that is not a backup this build can load, with a message to show. */
export class BackupError extends Error {}

export type ParsedBackup = {
  library: Library
  /** Null when the file carried none, so the device's own are left alone. */
  preferences: Preferences | null
  /** Records in the file that could not be made sense of. */
  skipped: number
  exportedAt: number | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Only records with an id of their own are taken. The migrations would make
 * one up, but a made-up id is a new one every load -- so loading the same file
 * twice would give two of everything, and any song naming the beat would lose
 * it.
 */
function readAll<T>(value: unknown, migrate: (raw: unknown) => T | null) {
  const items: T[] = []
  let skipped = 0

  for (const raw of Array.isArray(value) ? value : []) {
    const item = isRecord(raw) && typeof raw.id === 'string' && raw.id ? migrate(raw) : null
    if (item) items.push(item)
    else skipped++
  }
  return { items, skipped }
}

/**
 * Reads a backup file's text. Throws a BackupError, worded for the person who
 * picked the file, when it is not something to load at all; a file that is
 * merely partly damaged loads what it can and counts the rest.
 */
export function parseBackup(text: string): ParsedBackup {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new BackupError('That file is not a FloatLoops backup.')
  }

  if (!isRecord(parsed) || parsed.app !== BACKUP_APP) {
    throw new BackupError('That file is not a FloatLoops backup.')
  }

  const format = typeof parsed.format === 'number' ? parsed.format : 0
  if (format > BACKUP_FORMAT) {
    throw new BackupError(
      'That backup was made by a newer version of FloatLoops. Reload the app to update it, then try again.',
    )
  }

  const patterns = readAll(parsed.patterns, migratePattern)
  const songs = readAll(parsed.songs, migrateSong)

  return {
    library: { patterns: patterns.items, songs: songs.items },
    preferences: isRecord(parsed.preferences) ? readPreferences(parsed.preferences) : null,
    skipped: patterns.skipped + songs.skipped,
    exportedAt: typeof parsed.exportedAt === 'number' ? parsed.exportedAt : null,
  }
}
