import { useCallback, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLibraryStore } from '../state/libraryStore'
import { usePatternStore } from '../state/patternStore'
import { useSongStore } from '../state/songStore'
import { confirmLeavingBeatForSong, isUnsaved, songBeingEditedFor } from './unsaved'
import { saveWorkingBeat } from './sharedBeat'

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
 * Shown for the trip in from the song, not merely for a beat the open song
 * happens to play. The song store holds whatever was last arranged, so a beat
 * opened from the library is often in it by coincidence -- and offering "back
 * to song" there sends you somewhere you never were. The row is still checked
 * alongside, so the bar goes when the song stops playing the beat.
 */
export function BeatInSong() {
  const navigate = useNavigate()
  const pattern = usePatternStore((s) => s.pattern)
  const fromSong = usePatternStore((s) => s.fromSong)
  const song = useSongStore((s) => s.song)
  const saved = useLibraryStore((s) => s.patternsById.get(pattern.id))

  const [saving, setSaving] = useState<'idle' | 'saving' | 'failed'>('idle')

  const onSaveAndBack = useCallback(async () => {
    setSaving('saving')
    try {
      // Exactly the transport's Save, down to the question a beat other songs
      // play asks before it goes through.
      await saveWorkingBeat()
    } catch {
      setSaving('failed')
      return
    }
    setSaving('idle')
    void navigate('/song')
  }, [navigate])

  const onLeave = useCallback(() => {
    if (confirmLeavingBeatForSong()) void navigate('/song')
  }, [navigate])

  // Comparing the two beats outright, so it is only redone when one changes.
  // Above the early return, because a hook cannot be conditional.
  const unsaved = useMemo(() => isUnsaved(pattern, saved), [pattern, saved])

  if (!songBeingEditedFor(pattern, song, fromSong)) return null

  return (
    <div className="in-song">
      <span className="in-song__what">
        In the song <strong>{song.name}</strong>
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
