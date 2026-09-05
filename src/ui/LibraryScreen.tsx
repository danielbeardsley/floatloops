import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLibraryStore } from '../state/libraryStore'
import { usePatternStore } from '../state/patternStore'
import { stop } from '../state/transport'
import { createEmptyPattern } from '../state/schema'
import { PatternCard } from './PatternCard'

export function LibraryScreen() {
  const navigate = useNavigate()
  const patterns = useLibraryStore((s) => s.patterns)
  const loading = useLibraryStore((s) => s.loading)
  const error = useLibraryStore((s) => s.error)
  const refresh = useLibraryStore((s) => s.refresh)
  const setPattern = usePatternStore((s) => s.setPattern)

  useEffect(() => {
    void refresh()
  }, [refresh])

  const onNew = () => {
    stop()
    setPattern(createEmptyPattern())
    void navigate('/')
  }

  return (
    <div className="library">
      <div className="library__head">
        <h2 className="library__title">Saved beats</h2>
        <button type="button" className="button button--primary" onClick={onNew}>
          New beat
        </button>
      </div>

      {error ? <p className="library__message library__message--error">{error}</p> : null}

      {loading && patterns.length === 0 ? (
        <p className="library__message">Loading…</p>
      ) : null}

      {!loading && !error && patterns.length === 0 ? (
        <p className="library__message">
          Nothing saved yet. Make a beat, give it a name, and press Save.
        </p>
      ) : null}

      <div className="library__list">
        {patterns.map((pattern) => (
          <PatternCard key={pattern.id} pattern={pattern} />
        ))}
      </div>
    </div>
  )
}
