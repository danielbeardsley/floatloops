import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLibraryStore } from '../state/libraryStore'
import { usePatternStore } from '../state/patternStore'
import { useSongStore } from '../state/songStore'
import { stop } from '../state/transport'
import { createEmptyPattern } from '../state/schema'
import { createEmptySong } from '../state/song'
import { PatternCard } from './PatternCard'
import { SongCard } from './SongCard'
import { useStopOnLeave } from './useStopOnLeave'

export function LibraryScreen() {
  const navigate = useNavigate()
  const patterns = useLibraryStore((s) => s.patterns)
  const songs = useLibraryStore((s) => s.songs)
  const loading = useLibraryStore((s) => s.loading)
  const error = useLibraryStore((s) => s.error)
  const refresh = useLibraryStore((s) => s.refresh)
  const setPattern = usePatternStore((s) => s.setPattern)
  const setSong = useSongStore((s) => s.setSong)

  // A preview left running after you leave is the same sound with no visible
  // source that leaving the beat or song screen used to produce.
  useStopOnLeave()

  useEffect(() => {
    void refresh()
  }, [refresh])

  const onNewBeat = () => {
    stop()
    setPattern(createEmptyPattern())
    void navigate('/')
  }

  const onNewSong = () => {
    stop()
    setSong(createEmptySong())
    void navigate('/song')
  }

  const empty = !loading && !error

  return (
    <div className="library">
      {error ? <p className="library__message library__message--error">{error}</p> : null}

      {loading && patterns.length === 0 && songs.length === 0 ? (
        <p className="library__message">Loading…</p>
      ) : null}

      <section className="library__section">
        <div className="library__head">
          <h2 className="library__title">Songs</h2>
          <button type="button" className="button button--primary" onClick={onNewSong}>
            New song
          </button>
        </div>

        {empty && songs.length === 0 ? (
          <p className="library__message">
            Nothing arranged yet. A song plays your saved beats one after another.
          </p>
        ) : null}

        <div className="library__list">
          {songs.map((song) => (
            <SongCard key={song.id} song={song} />
          ))}
        </div>
      </section>

      <section className="library__section">
        <div className="library__head">
          <h2 className="library__title">Saved beats</h2>
          <button type="button" className="button button--primary" onClick={onNewBeat}>
            New beat
          </button>
        </div>

        {empty && patterns.length === 0 ? (
          <p className="library__message">
            Nothing saved yet. Make a beat, give it a name, and press Save.
          </p>
        ) : null}

        <div className="library__list">
          {patterns.map((pattern) => (
            <PatternCard key={pattern.id} pattern={pattern} />
          ))}
        </div>
      </section>
    </div>
  )
}
