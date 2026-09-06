import { openDB, type IDBPDatabase } from 'idb'
import { migratePattern, migrateSong } from './migrate'
import type { Pattern } from './schema'
import type { Song } from './song'

/**
 * Saved patterns live in IndexedDB on the device. No server, no accounts.
 *
 * Everything goes through this module so the backing store stays swappable,
 * and so every read passes through migratePattern -- nothing outside here ever
 * sees a raw stored object.
 */

const DB_NAME = 'floatloops'
const DB_VERSION = 2
const STORE = 'patterns'
const SONG_STORE = 'songs'

let dbPromise: Promise<IDBPDatabase> | null = null

function db(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    // The upgrade is written as a set of conditional creates rather than a
    // switch on oldVersion, so a database at any past version lands in the
    // same shape.
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(database) {
        for (const name of [STORE, SONG_STORE]) {
          if (database.objectStoreNames.contains(name)) continue
          database.createObjectStore(name, { keyPath: 'id' }).createIndex('updatedAt', 'updatedAt')
        }
      },
    })
  }
  return dbPromise
}

/** Most recently edited first, which is the order the library shows them in. */
export async function listPatterns(): Promise<Pattern[]> {
  const rows = await (await db()).getAll(STORE)
  return rows
    .map(migratePattern)
    .filter((p): p is Pattern => p !== null)
    .sort((a, b) => b.updatedAt - a.updatedAt)
}

export async function getPattern(id: string): Promise<Pattern | null> {
  return migratePattern(await (await db()).get(STORE, id))
}

export async function savePattern(pattern: Pattern): Promise<Pattern> {
  const saved: Pattern = { ...pattern, updatedAt: Date.now() }
  await (await db()).put(STORE, saved)
  return saved
}

export async function deletePattern(id: string): Promise<void> {
  await (await db()).delete(STORE, id)
}

/* --- songs --------------------------------------------------------------- */

export async function listSongs(): Promise<Song[]> {
  const rows = await (await db()).getAll(SONG_STORE)
  return rows
    .map(migrateSong)
    .filter((s): s is Song => s !== null)
    .sort((a, b) => b.updatedAt - a.updatedAt)
}

export async function getSong(id: string): Promise<Song | null> {
  return migrateSong(await (await db()).get(SONG_STORE, id))
}

export async function saveSong(song: Song): Promise<Song> {
  const saved: Song = { ...song, updatedAt: Date.now() }
  await (await db()).put(SONG_STORE, saved)
  return saved
}

export async function deleteSong(id: string): Promise<void> {
  await (await db()).delete(SONG_STORE, id)
}

/**
 * Closes the connection and forgets it. Without the close, anything trying to
 * delete or upgrade the database blocks forever waiting on this handle.
 */
export async function closeStorage(): Promise<void> {
  const pending = dbPromise
  dbPromise = null
  if (pending) (await pending).close()
}
