import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react'
import { usePatternStore } from '../state/patternStore'
import { useSongStore } from '../state/songStore'
import { useLibraryStore } from '../state/libraryStore'
import { toggleSongPlay, togglePlay } from '../state/transport'
import { MAX_BPM, MIN_BPM } from '../audio/timing'
import { isUnsaved, patternIsInSong, songIsUnsaved } from './unsaved'

type SaveState = 'idle' | 'saving' | 'saved' | 'failed'

const SAVE_LABELS: Record<SaveState, string> = {
  idle: 'Save',
  saving: 'Saving…',
  saved: 'Saved',
  failed: 'Failed',
}

type TransportBarProps = {
  isPlaying: boolean
  name: string
  bpm: number
  nameLabel: string
  onToggle: () => void
  onRename: (name: string) => void
  onBpm: (bpm: number) => void
  onSave: () => Promise<void>
  children?: ReactNode
}

/**
 * Play, name, save and tempo. Beats and songs get the same bar because they
 * are the same four decisions -- only what is being saved differs.
 */
function TransportBar({
  isPlaying,
  name,
  bpm,
  nameLabel,
  onToggle,
  onRename,
  onBpm,
  onSave,
  children,
}: TransportBarProps) {
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const resetSaveLabel = useRef<number>(0)

  const save = useCallback(async () => {
    setSaveState('saving')
    try {
      await onSave()
      setSaveState('saved')
    } catch {
      setSaveState('failed')
    }

    window.clearTimeout(resetSaveLabel.current)
    resetSaveLabel.current = window.setTimeout(() => setSaveState('idle'), 1800)
  }, [onSave])

  return (
    <div className="transport">
      <button
        type="button"
        className={`transport__play${isPlaying ? ' transport__play--on' : ''}`}
        onClick={onToggle}
        aria-pressed={isPlaying}
      >
        {isPlaying ? 'Stop' : 'Play'}
      </button>

      <input
        type="text"
        className="transport__name"
        value={name}
        onChange={(e) => onRename(e.target.value)}
        aria-label={nameLabel}
        maxLength={40}
      />

      <button
        type="button"
        className="transport__save"
        onClick={() => void save()}
        disabled={saveState === 'saving'}
      >
        {SAVE_LABELS[saveState]}
      </button>

      {children}

      <label className="transport__tempo">
        <span className="transport__tempo-label">Tempo</span>
        <input
          type="range"
          min={MIN_BPM}
          max={MAX_BPM}
          step={1}
          value={bpm}
          onChange={(e) => onBpm(Number(e.target.value))}
          aria-label="Tempo in beats per minute"
        />
        <output className="transport__bpm">{bpm} bpm</output>
      </label>
    </div>
  )
}

export function Transport() {
  const isPlaying = usePatternStore((s) => s.isPlaying)
  const pattern = usePatternStore((s) => s.pattern)
  const setBpm = usePatternStore((s) => s.setBpm)
  const rename = usePatternStore((s) => s.rename)
  const setPattern = usePatternStore((s) => s.setPattern)
  const saveToLibrary = useLibraryStore((s) => s.save)
  const saved = useLibraryStore((s) => s.patternsById.get(pattern.id))
  const song = useSongStore((s) => s.song)

  // Suppressed while the beat belongs to the song on screen, because the
  // way-back bar is already saying so a few pixels above -- and saying the
  // more useful half of it, which is what the song plays meanwhile.
  const unsaved =
    useMemo(() => isUnsaved(pattern, saved), [pattern, saved]) &&
    !patternIsInSong(pattern, song)

  const onSave = useCallback(async () => {
    // Keep the saved copy, so pressing Save again updates in place rather
    // than leaving the sequencer holding a stale updatedAt.
    setPattern(await saveToLibrary(usePatternStore.getState().pattern))
  }, [saveToLibrary, setPattern])

  return (
    <TransportBar
      isPlaying={isPlaying}
      name={pattern.name}
      bpm={pattern.bpm}
      nameLabel="Beat name"
      onToggle={() => void togglePlay()}
      onRename={rename}
      onBpm={setBpm}
      onSave={onSave}
    >
      {unsaved ? <span className="unsaved-mark">Unsaved</span> : null}
    </TransportBar>
  )
}

export function SongTransport() {
  const isPlaying = useSongStore((s) => s.isPlaying)
  const song = useSongStore((s) => s.song)
  const setBpm = useSongStore((s) => s.setBpm)
  const rename = useSongStore((s) => s.rename)
  const setSong = useSongStore((s) => s.setSong)
  const saveToLibrary = useLibraryStore((s) => s.saveSong)
  const saved = useLibraryStore((s) => s.songs.find((item) => item.id === song.id))

  // Leaving for the library is where an arrangement gets thrown away, so the
  // warning there cannot be the first you hear of it.
  const unsaved = useMemo(() => songIsUnsaved(song, saved), [song, saved])

  const onSave = useCallback(async () => {
    setSong(await saveToLibrary(useSongStore.getState().song))
  }, [saveToLibrary, setSong])

  return (
    <TransportBar
      isPlaying={isPlaying}
      name={song.name}
      bpm={song.bpm}
      nameLabel="Song name"
      onToggle={() => void toggleSongPlay()}
      onRename={rename}
      onBpm={setBpm}
      onSave={onSave}
    >
      {unsaved ? <span className="unsaved-mark">Unsaved</span> : null}
    </TransportBar>
  )
}
