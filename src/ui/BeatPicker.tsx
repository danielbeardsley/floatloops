import { useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLibraryStore } from '../state/libraryStore'
import { usePatternStore } from '../state/patternStore'
import { useSongStore } from '../state/songStore'
import { createEmptyPattern } from '../state/schema'
import { stop } from '../state/transport'
import { PatternThumbnail } from './PatternThumbnail'

/**
 * Choosing what a new song row plays: something already in the library, or a
 * beat that does not exist yet.
 *
 * The new-beat path saves the empty beat before adding the row. A row names a
 * beat rather than holding one, so an unsaved beat would leave the row
 * pointing at nothing the moment the song was saved.
 */
export function BeatPicker({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
  const patterns = useLibraryStore((s) => s.patterns)
  const loading = useLibraryStore((s) => s.loading)
  const error = useLibraryStore((s) => s.error)
  const refresh = useLibraryStore((s) => s.refresh)
  const saveToLibrary = useLibraryStore((s) => s.save)
  const addRow = useSongStore((s) => s.addRow)

  useEffect(() => {
    void refresh()
  }, [refresh])

  const onPick = useCallback(
    (patternId: string) => {
      addRow(patternId)
      onClose()
    },
    [addRow, onClose],
  )

  const onNew = useCallback(async () => {
    const saved = await saveToLibrary(createEmptyPattern('New Beat'))
    addRow(saved.id)
    onClose()

    // Straight into the sequencer: a brand new beat is silent, and an empty
    // row in the song would be nothing to look at.
    stop()
    usePatternStore.getState().setPattern(saved, useSongStore.getState().song.id)
    void navigate('/')
  }, [addRow, navigate, onClose, saveToLibrary])

  return (
    <div className="sheet" role="dialog" aria-modal="true" aria-label="Add a beat to the song">
      <div className="sheet__panel">
        <div className="sheet__head">
          <h2 className="sheet__title">Add a beat</h2>
          <button type="button" className="card__button" onClick={onClose}>
            Cancel
          </button>
        </div>

        <button type="button" className="button button--primary sheet__new" onClick={() => void onNew()}>
          + Make a new beat
        </button>

        {error ? <p className="library__message library__message--error">{error}</p> : null}

        {loading && patterns.length === 0 ? <p className="library__message">Loading…</p> : null}

        {!loading && !error && patterns.length === 0 ? (
          <p className="library__message">
            No saved beats yet. Make a new one and it will be added to the song.
          </p>
        ) : null}

        <div className="sheet__list">
          {patterns.map((pattern) => (
            <button
              key={pattern.id}
              type="button"
              className="pick"
              onClick={() => onPick(pattern.id)}
            >
              <span className="pick__shape">
                <PatternThumbnail pattern={pattern} />
              </span>
              <span className="pick__name">{pattern.name}</span>
              <span className="pick__meta">
                {pattern.measures} {pattern.measures === 1 ? 'bar' : 'bars'}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
