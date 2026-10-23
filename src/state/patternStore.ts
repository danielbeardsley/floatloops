import { create } from 'zustand'
import * as edit from './schema'
import type { Pattern } from './schema'
import type { MelodyVoiceId } from '../audio/melodyKit'

/**
 * Zustand rather than context+reducer for one specific reason: the scheduler
 * needs to read the current pattern on every tick via getState(), without
 * subscribing to renders.
 */
export type PatternStore = {
  pattern: Pattern
  /**
   * A pattern being auditioned from the library. While set, the sequencer
   * plays this instead of `pattern`, so previewing never disturbs the beat
   * currently open in the sequencer.
   */
  preview: Pattern | null
  /**
   * The id of the song this beat was opened from, when it was opened from one.
   *
   * Not the same question as whether the song plays it. The song store holds
   * whatever was last arranged, so a beat opened from the library often
   * belongs to it by coincidence -- and a beat being edited on its own must
   * not offer a way back to a song nobody asked for, or let a fork rearrange
   * one. Cleared by default, so only a deliberate trip in from a song sets it.
   */
  fromSong: string | null
  /**
   * The song bar the beat was opened at, when it was opened at one.
   *
   * A beat edited on its own has no such question. Inside a song it plays in
   * bars alongside other rows, so which pass is being edited decides what
   * lines up with it -- and that is a fact about the trip in, not about the
   * beat. Null means no particular place, which resolves to the first one.
   */
  atBar: number | null
  /**
   * Song rows whose beats are hidden from the ghosts, by row id.
   *
   * Part of the trip in rather than of the beat: it is a view of the song
   * being tidied, not an edit, so it is cleared whenever a different beat is
   * opened and never saved anywhere.
   */
  hiddenOthers: string[]
  isPlaying: boolean

  setPattern: (pattern: Pattern, fromSong?: string | null, atBar?: number | null) => void
  setAtBar: (atBar: number | null) => void
  toggleOther: (rowId: string) => void
  setPreview: (preview: Pattern | null) => void
  toggleStep: (trackIndex: number, stepIndex: number) => void
  setStep: (trackIndex: number, stepIndex: number, value: number) => void
  setBpm: (bpm: number) => void
  toggleMute: (trackIndex: number) => void
  toggleDrumsMute: () => void
  setTrackLevel: (trackIndex: number, level: number) => void
  addMeasure: () => void
  removeMeasure: (measureIndex: number) => void
  duplicateMeasure: (measureIndex: number) => void
  duplicateBeat: () => void
  addNote: (draft: edit.NoteDraft) => void
  updateNote: (id: string, draft: edit.NoteDraft) => void
  removeNote: (id: string) => void
  setMelodyLevel: (level: number) => void
  setMelodyVoice: (voiceId: MelodyVoiceId) => void
  toggleMelodyMute: () => void
  rename: (name: string) => void
  setPlaying: (isPlaying: boolean) => void
}

export const usePatternStore = create<PatternStore>()((set) => ({
  pattern: edit.demoPattern(),
  preview: null,
  fromSong: null,
  atBar: null,
  hiddenOthers: [],
  isPlaying: false,

  setPattern: (pattern, fromSong = null, atBar = null) =>
    set({ pattern, fromSong, atBar, hiddenOthers: [] }),
  setAtBar: (atBar) => set({ atBar }),
  toggleOther: (rowId) =>
    set((s) => ({
      hiddenOthers: s.hiddenOthers.includes(rowId)
        ? s.hiddenOthers.filter((id) => id !== rowId)
        : [...s.hiddenOthers, rowId],
    })),
  setPreview: (preview) => set({ preview }),
  toggleStep: (trackIndex, stepIndex) =>
    set((s) => ({ pattern: edit.toggleStep(s.pattern, trackIndex, stepIndex) })),
  setStep: (trackIndex, stepIndex, value) =>
    set((s) => ({ pattern: edit.setStep(s.pattern, trackIndex, stepIndex, value) })),
  setBpm: (bpm) => set((s) => ({ pattern: edit.setPatternBpm(s.pattern, bpm) })),
  toggleMute: (trackIndex) => set((s) => ({ pattern: edit.toggleMute(s.pattern, trackIndex) })),
  toggleDrumsMute: () => set((s) => ({ pattern: edit.toggleDrumsMute(s.pattern) })),
  setTrackLevel: (trackIndex, level) =>
    set((s) => ({ pattern: edit.setTrackLevel(s.pattern, trackIndex, level) })),
  addMeasure: () => set((s) => ({ pattern: edit.addMeasure(s.pattern) })),
  removeMeasure: (measureIndex) =>
    set((s) => ({ pattern: edit.removeMeasure(s.pattern, measureIndex) })),
  duplicateMeasure: (measureIndex) =>
    set((s) => ({ pattern: edit.duplicateMeasure(s.pattern, measureIndex) })),
  duplicateBeat: () => set((s) => ({ pattern: edit.duplicateBeat(s.pattern) })),
  addNote: (draft) => set((s) => ({ pattern: edit.addNote(s.pattern, draft) })),
  updateNote: (id, draft) => set((s) => ({ pattern: edit.updateNote(s.pattern, id, draft) })),
  removeNote: (id) => set((s) => ({ pattern: edit.removeNote(s.pattern, id) })),
  setMelodyLevel: (level) => set((s) => ({ pattern: edit.setMelodyLevel(s.pattern, level) })),
  setMelodyVoice: (voiceId) => set((s) => ({ pattern: edit.setMelodyVoice(s.pattern, voiceId) })),
  toggleMelodyMute: () => set((s) => ({ pattern: edit.toggleMelodyMute(s.pattern) })),
  rename: (name) => set((s) => ({ pattern: edit.renamePattern(s.pattern, name) })),
  setPlaying: (isPlaying) => set({ isPlaying }),
}))
