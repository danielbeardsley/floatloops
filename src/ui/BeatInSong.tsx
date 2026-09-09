import { useCallback, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Place } from '../state/alignment'
import { useLibraryStore } from '../state/libraryStore'
import { usePatternStore } from '../state/patternStore'
import { useSongStore } from '../state/songStore'
import { OthersHere } from './OthersHere'
import { barsLabel, timeLabel } from './places'
import { useGhosts, usePlace } from './useGhosts'
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
/** The bar of the pass one along from this one, stopping at either end. */
function step(places: readonly Place[], from: Place, by: number): number {
  const index = places.findIndex((place) => place.bar === from.bar)
  const next = Math.min(places.length - 1, Math.max(0, index + by))
  return places[next].bar
}

export function BeatInSong() {
  const navigate = useNavigate()
  const pattern = usePatternStore((s) => s.pattern)
  const fromSong = usePatternStore((s) => s.fromSong)
  const song = useSongStore((s) => s.song)
  const setAtBar = usePatternStore((s) => s.setAtBar)
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

  // Which pass of the beat is being edited, and -- while the switch is on --
  // what else is playing there. The place is said either way: it is where you
  // are, not something the switch turns off.
  const here = usePlace()
  const ghosts = useGhosts()
  const place = here?.place ?? null

  if (!songBeingEditedFor(pattern, song, fromSong)) return null

  return (
    <div className="in-song">
      <span className="in-song__what">
        In the song <strong>{song.name}</strong>
        {place ? (
          <span className="in-song__place">
            {' · '}
            {barsLabel(place)}
            {/* Only worth saying when there is more than one time to be at. */}
            {here && here.places.length > 1 ? ` · ${timeLabel(place)}` : ''}
          </span>
        ) : null}
      </span>

      {/*
       * Only where the passes actually differ. Everywhere else they are dead
       * weight: every time through looks the same, so there is nothing to
       * choose between them and no reason to offer the choice.
       */}
      {here && place && ghosts?.elsewhere ? (
        <span className="in-song__step">
          <button
            type="button"
            className="in-song__arrow"
            onClick={() => setAtBar(step(here.places, place, -1))}
            aria-label="Edit at the time before this one"
            title="The time before this one"
          >
            ◂
          </button>
          <button
            type="button"
            className="in-song__arrow"
            onClick={() => setAtBar(step(here.places, place, 1))}
            aria-label="Edit at the next time it plays"
            title="The next time it plays"
          >
            ▸
          </button>
        </span>
      ) : null}

      {ghosts ? <OthersHere ghosts={ghosts} /> : null}

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
