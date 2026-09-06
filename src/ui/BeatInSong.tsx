import { useCallback, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLibraryStore } from '../state/libraryStore'
import { usePatternStore } from '../state/patternStore'
import { useSongStore } from '../state/songStore'
import { confirmLeavingBeatForSong, isUnsaved } from './unsaved'

/**
 * The way back, shown while the beat in the sequencer is one the open song
 * plays.
 *
 * Editing a beat from a song used to drop you into the sequencer with nothing
 * to say where you had come from, and the only route back was the nav bar and
 * remembering to press Save on the way. Since a song row names a library beat,
 * forgetting that save means the song quietly goes on playing the old version.
 * So the way back and the save are one button.
 *
 * Whether to show this is derived from the song rather than remembered from
 * the trip in: "this beat is in the song you have open" is true however you
 * got here, and cannot go stale when the row is removed.
 */
export function BeatInSong() {
  const navigate = useNavigate()
  const pattern = usePatternStore((s) => s.pattern)
  const setPattern = usePatternStore((s) => s.setPattern)
  const songName = useSongStore((s) => s.song.name)
  const rows = useSongStore((s) => s.song.rows)
  const saved = useLibraryStore((s) => s.patternsById.get(pattern.id))
  const saveToLibrary = useLibraryStore((s) => s.save)

  const [saving, setSaving] = useState<'idle' | 'saving' | 'failed'>('idle')

  const onSaveAndBack = useCallback(async () => {
    setSaving('saving')
    try {
      // Keep the saved copy, exactly as the transport's Save does, so the beat
      // reads as saved the moment it is.
      setPattern(await saveToLibrary(usePatternStore.getState().pattern))
    } catch {
      setSaving('failed')
      return
    }
    setSaving('idle')
    void navigate('/song')
  }, [navigate, saveToLibrary, setPattern])

  const onLeave = useCallback(() => {
    if (confirmLeavingBeatForSong()) void navigate('/song')
  }, [navigate])

  // Comparing the two beats outright, so it is only redone when one changes.
  // Above the early return, because a hook cannot be conditional.
  const unsaved = useMemo(() => isUnsaved(pattern, saved), [pattern, saved])

  if (!rows.some((row) => row.patternId === pattern.id)) return null

  return (
    <div className="in-song">
      <span className="in-song__what">
        In the song <strong>{songName}</strong>
      </span>

      {unsaved ? (
        <span className="in-song__unsaved">
          Unsaved — the song plays the last version you saved
        </span>
      ) : null}

      {saving === 'failed' ? (
        <span className="in-song__failed">Could not save. Try again.</span>
      ) : null}

      <span className="in-song__actions">
        {unsaved ? (
          <>
            <button type="button" className="button" onClick={onLeave}>
              Back without saving
            </button>
            <button
              type="button"
              className="button button--primary"
              onClick={() => void onSaveAndBack()}
              disabled={saving === 'saving'}
            >
              {saving === 'saving' ? 'Saving…' : 'Save & back to song'}
            </button>
          </>
        ) : (
          <button type="button" className="button button--primary" onClick={onLeave}>
            Back to song
          </button>
        )}
      </span>
    </div>
  )
}
