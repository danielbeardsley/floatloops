import { create } from 'zustand'
import * as edit from './song'
import type { Song } from './song'

/**
 * The song being arranged. A sibling of usePatternStore, and for the same
 * reason: the scheduler reads it through getState() on every tick without
 * subscribing to renders.
 *
 * `isPlaying` is per-store rather than global because the transport plays one
 * thing at a time -- starting a song stops the beat, and each screen's play
 * button has to show the truth about its own timeline.
 */
export type SongStore = {
  song: Song
  /** A saved song being auditioned from the library, as with beats. */
  preview: Song | null
  isPlaying: boolean

  setSong: (song: Song) => void
  setPreview: (preview: Song | null) => void
  addRow: (patternId: string) => void
  removeRow: (rowIndex: number) => void
  setRowPattern: (rowIndex: number, patternId: string) => void
  setRowLevel: (rowIndex: number, level: number) => void
  toggleRowMute: (rowIndex: number) => void
  addClip: (rowIndex: number, draft: edit.ClipDraft) => void
  updateClip: (rowIndex: number, id: string, draft: edit.ClipDraft) => void
  removeClip: (rowIndex: number, id: string) => void
  addBar: () => void
  removeBar: (bar: number) => void
  setBpm: (bpm: number) => void
  rename: (name: string) => void
  setPlaying: (isPlaying: boolean) => void
}

export const useSongStore = create<SongStore>()((set) => ({
  song: edit.createEmptySong(),
  preview: null,
  isPlaying: false,

  setSong: (song) => set({ song }),
  setPreview: (preview) => set({ preview }),
  addRow: (patternId) => set((s) => ({ song: edit.addRow(s.song, patternId) })),
  removeRow: (rowIndex) => set((s) => ({ song: edit.removeRow(s.song, rowIndex) })),
  setRowPattern: (rowIndex, patternId) =>
    set((s) => ({ song: edit.setRowPattern(s.song, rowIndex, patternId) })),
  setRowLevel: (rowIndex, level) =>
    set((s) => ({ song: edit.setRowLevel(s.song, rowIndex, level) })),
  toggleRowMute: (rowIndex) => set((s) => ({ song: edit.toggleRowMute(s.song, rowIndex) })),
  addClip: (rowIndex, draft) => set((s) => ({ song: edit.addClip(s.song, rowIndex, draft) })),
  updateClip: (rowIndex, id, draft) =>
    set((s) => ({ song: edit.updateClip(s.song, rowIndex, id, draft) })),
  removeClip: (rowIndex, id) => set((s) => ({ song: edit.removeClip(s.song, rowIndex, id) })),
  addBar: () => set((s) => ({ song: edit.addBar(s.song) })),
  removeBar: (bar) => set((s) => ({ song: edit.removeBar(s.song, bar) })),
  setBpm: (bpm) => set((s) => ({ song: edit.setSongBpm(s.song, bpm) })),
  rename: (name) => set((s) => ({ song: edit.renameSong(s.song, name) })),
  setPlaying: (isPlaying) => set({ isPlaying }),
}))
