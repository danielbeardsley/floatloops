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

/**
 * An upgrade cannot run while another connection is still on the old version,
 * and IndexedDB's answer to that is to wait -- forever, silently. That is the
 * worst possible failure here: the library screen would spin with nothing to
 * show and nothing to say.
 *
 * So both sides of the standoff are handled. A connection that is *blocking*
 * an upgrade closes itself and gets out of the way; a connection that is
 * *blocked* by one that will not gives up with something the user can act on.
 */
function open(): Promise<IDBPDatabase> {
  let gaveUp = false

  return new Promise<IDBPDatabase>((resolve, reject) => {
    const opening = openDB(DB_NAME, DB_VERSION, {
      // Written as a set of conditional creates rather than a switch on
      // oldVersion, so a database at any past version lands in the same shape.
      upgrade(database) {
        for (const name of [STORE, SONG_STORE]) {
          if (database.objectStoreNames.contains(name)) continue
          database.createObjectStore(name, { keyPath: 'id' }).createIndex('updatedAt', 'updatedAt')
        }
      },
      blocked() {
        gaveUp = true
        reject(new Error('FloatLoops is open in another tab. Close it, then reload this one.'))
      },
      blocking() {
        // Something newer wants in. Drop this handle so it can proceed; the
        // next read opens a fresh one.
        void closeStorage()
      },
    })

    void opening.then((database) => {
      // The upgrade can still go through later, once whatever was in the way
      // lets go. By then nobody holds this handle, so it is closed rather than
      // left open to block the next attempt in turn.
      if (gaveUp) database.close()
      else resolve(database)
    }, reject)
  })
}

function db(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    // A failed open is not remembered, so closing the offending tab and trying
    // again is enough to recover -- no reload required.
    dbPromise = open().catch((error: unknown) => {
      dbPromise = null
      throw error
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

/* --- backups ------------------------------------------------------------- */

export type Library = { patterns: Pattern[]; songs: Song[] }

/** Everything this build can read, beats and songs both, for a backup file. */
export async function exportLibrary(): Promise<Library> {
  const [patterns, songs] = await Promise.all([listPatterns(), listSongs()])
  return { patterns, songs }
}

export type MergeCount = { added: number; updated: number; unchanged: number }
export type MergeResult = { patterns: MergeCount; songs: MergeCount }

/**
 * Writes a backup into the library without ever losing anything already here.
 *
 * Records are matched by id -- they have to keep their ids, because song rows
 * name beats by them. Something the device does not have is added; something
 * it has is replaced only by a copy edited more recently. Nothing is deleted,
 * so loading an old backup onto a device with newer work is harmless.
 *
 * Unlike savePattern, the timestamps are kept as they were: stamping them now
 * would make every imported copy the newest, and the next import would let a
 * stale backup win.
 *
 * One transaction across both stores, so a failure part way leaves the
 * library as it was rather than half restored.
 */
export async function mergeLibrary(library: Library): Promise<MergeResult> {
  const transaction = (await db()).transaction([STORE, SONG_STORE], 'readwrite')
  // Awaited on success below. On failure the error that matters is the one
  // thrown, and an abort rejecting this as well is not a second problem.
  transaction.done.catch(() => {})

  async function merge<T extends { id: string; updatedAt: number }>(
    storeName: typeof STORE | typeof SONG_STORE,
    items: T[],
    read: (raw: unknown) => T | null,
  ): Promise<MergeCount> {
    const store = transaction.objectStore(storeName)
    const count: MergeCount = { added: 0, updated: 0, unchanged: 0 }

    for (const item of items) {
      const existing = read(await store.get(item.id))
      if (existing && existing.updatedAt >= item.updatedAt) {
        count.unchanged++
        continue
      }
      await store.put(item)
      if (existing) count.updated++
      else count.added++
    }
    return count
  }

  try {
    const [patterns, songs] = await Promise.all([
      merge(STORE, library.patterns, migratePattern),
      merge(SONG_STORE, library.songs, migrateSong),
    ])
    await transaction.done
    return { patterns, songs }
  } catch (error) {
    // A transaction only rolls back on its own when a request fails. Anything
    // else going wrong part way would otherwise commit the half it had done.
    try {
      transaction.abort()
    } catch {
      // Already finished or already aborted; either way there is nothing to undo.
    }
    throw error
  }
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
