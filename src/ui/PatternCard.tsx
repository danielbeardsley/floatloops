import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePatternStore } from '../state/patternStore'
import { useLibraryStore } from '../state/libraryStore'
import { playPreview, stop } from '../state/transport'
import type { Pattern } from '../state/schema'
import { PatternThumbnail } from './PatternThumbnail'

function describeWhen(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
  })
}

export function PatternCard({ pattern }: { pattern: Pattern }) {
  const navigate = useNavigate()
  const previewId = usePatternStore((s) => s.preview?.id ?? null)
  const isPlaying = usePatternStore((s) => s.isPlaying)
  const setPattern = usePatternStore((s) => s.setPattern)
  const remove = useLibraryStore((s) => s.remove)
  const duplicate = useLibraryStore((s) => s.duplicate)

  const isPreviewing = isPlaying && previewId === pattern.id

  const onPreview = useCallback(() => {
    if (isPreviewing) stop()
    else void playPreview(pattern)
  }, [isPreviewing, pattern])

  const onOpen = useCallback(() => {
    stop()
    setPattern(pattern)
    void navigate('/')
  }, [navigate, pattern, setPattern])

  const onDelete = useCallback(() => {
    // Deleting a beat cannot be undone, so it always asks first.
    if (!window.confirm(`Delete "${pattern.name}"? This cannot be undone.`)) return
    if (previewId === pattern.id) stop()
    void remove(pattern.id)
  }, [pattern.id, pattern.name, previewId, remove])

  return (
    <article className="card">
      <button type="button" className="card__shape" onClick={onOpen} aria-label={`Open ${pattern.name}`}>
        <PatternThumbnail pattern={pattern} />
      </button>

      <div className="card__body">
        <h3 className="card__name">{pattern.name}</h3>
        <p className="card__meta">
          {pattern.measures} {pattern.measures === 1 ? 'bar' : 'bars'} · {pattern.bpm} bpm ·{' '}
          {describeWhen(pattern.updatedAt)}
        </p>
      </div>

      <div className="card__actions">
        <button
          type="button"
          className={`card__button${isPreviewing ? ' card__button--on' : ''}`}
          onClick={onPreview}
          aria-label={isPreviewing ? `Stop ${pattern.name}` : `Play ${pattern.name}`}
        >
          {isPreviewing ? 'Stop' : 'Play'}
        </button>
        <button type="button" className="card__button" onClick={onOpen}>
          Open
        </button>
        <button
          type="button"
          className="card__button"
          onClick={() => void duplicate(pattern)}
          aria-label={`Duplicate ${pattern.name}`}
        >
          Copy
        </button>
        <button
          type="button"
          className="card__button card__button--danger"
          onClick={onDelete}
          aria-label={`Delete ${pattern.name}`}
        >
          Delete
        </button>
      </div>
    </article>
  )
}
