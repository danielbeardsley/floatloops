import { create } from 'zustand'
import {
  deletePattern,
  deleteSong,
  listPatterns,
  listSongs,
  savePattern,
  saveSong,
} from './storage'
import { createId, type Pattern } from './schema'
import type { Song } from './song'

export type LibraryStore = {
  patterns: Pattern[]
  /**
   * The same beats, keyed by id. Song rows name a beat rather than holding
   * one, so both the song grid and the scheduler need this lookup -- and the
   * scheduler needs it without a render, on every tick.
   */
  patternsById: ReadonlyMap<string, Pattern>
  songs: Song[]
  loading: boolean
  error: string | null

  refresh: () => Promise<void>
  save: (pattern: Pattern) => Promise<Pattern>
  remove: (id: string) => Promise<void>
  duplicate: (pattern: Pattern) => Promise<Pattern>

  saveSong: (song: Song) => Promise<Song>
  removeSong: (id: string) => Promise<void>
  duplicateSong: (song: Song) => Promise<Song>
}

/**
 * Safari clears IndexedDB for sites that are not installed to the home screen,
 * so a read failing is a real possibility rather than a theoretical one. It
 * surfaces as an error the library screen can show, never as a crash.
 */
function describe(error: unknown): string {
  return error instanceof Error ? error.message : 'Could not reach saved beats.'
}

/** Copies keep their contents but never their identity or their timestamps. */
function copyOf<T extends { id: string; name: string; createdAt: number; updatedAt: number }>(
  item: T,
): T {
  const now = Date.now()
  return { ...item, id: createId(), name: `${item.name} copy`, createdAt: now, updatedAt: now }
}

export const useLibraryStore = create<LibraryStore>()((set, get) => ({
  patterns: [],
  patternsById: new Map(),
  songs: [],
  loading: false,
  error: null,

  // Beats and songs are read together: a song is unreadable without the beats
  // its rows name, so there is no useful state in which only one is loaded.
  refresh: async () => {
    set({ loading: true, error: null })
    try {
      const [patterns, songs] = await Promise.all([listPatterns(), listSongs()])
      set({
        patterns,
        patternsById: new Map(patterns.map((pattern) => [pattern.id, pattern])),
        songs,
        loading: false,
      })
    } catch (error) {
      set({ error: describe(error), loading: false })
    }
  },

  save: async (pattern) => {
    const saved = await savePattern(pattern)
    await get().refresh()
    return saved
  },

  remove: async (id) => {
    await deletePattern(id)
    await get().refresh()
  },

  duplicate: async (pattern) => get().save(copyOf(pattern)),

  saveSong: async (song) => {
    const saved = await saveSong(song)
    await get().refresh()
    return saved
  },

  removeSong: async (id) => {
    await deleteSong(id)
    await get().refresh()
  },

  duplicateSong: async (song) => get().saveSong(copyOf(song)),
}))
