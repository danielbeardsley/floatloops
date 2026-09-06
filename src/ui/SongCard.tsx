import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLibraryStore } from '../state/libraryStore'
import { useSongStore } from '../state/songStore'
import { playSongPreview, stop } from '../state/transport'
import { confirmDiscardingSong } from './unsaved'
import type { Song } from '../state/song'
import { SongThumbnail } from './SongThumbnail'

export function SongCard({ song }: { song: Song }) {
  const navigate = useNavigate()
  const previewId = useSongStore((s) => s.preview?.id ?? null)
  const isPlaying = useSongStore((s) => s.isPlaying)
  const setSong = useSongStore((s) => s.setSong)
  const remove = useLibraryStore((s) => s.removeSong)
  const duplicate = useLibraryStore((s) => s.duplicateSong)

  const isPreviewing = isPlaying && previewId === song.id

  const onPreview = useCallback(() => {
    if (isPreviewing) stop()
    else void playSongPreview(song)
  }, [isPreviewing, song])

  const onOpen = useCallback(() => {
    // Opening replaces whatever is being arranged, including a song opened
    // from here a moment ago and edited since.
    if (!confirmDiscardingSong(`Opening "${song.name}"`)) return

    stop()
    setSong(song)
    void navigate('/song')
  }, [navigate, setSong, song])

  const onDelete = useCallback(() => {
    // Deleting cannot be undone, so it always asks first. The beats the song
    // used are untouched: a song only ever named them.
    if (!window.confirm(`Delete "${song.name}"? The beats in it are kept.`)) return
    if (previewId === song.id) stop()
    void remove(song.id)
  }, [previewId, remove, song.id, song.name])

  const clips = song.rows.reduce((total, row) => total + row.clips.length, 0)

  return (
    <article className="card">
      <button type="button" className="card__shape" onClick={onOpen} aria-label={`Open ${song.name}`}>
        <SongThumbnail song={song} />
      </button>

      <div className="card__body">
        <h3 className="card__name">{song.name}</h3>
        <p className="card__meta">
          {song.bars} {song.bars === 1 ? 'bar' : 'bars'} · {song.rows.length}{' '}
          {song.rows.length === 1 ? 'beat' : 'beats'} · {clips}{' '}
          {clips === 1 ? 'block' : 'blocks'} · {song.bpm} bpm
        </p>
      </div>

      <div className="card__actions">
        <button
          type="button"
          className={`card__button${isPreviewing ? ' card__button--on' : ''}`}
          onClick={onPreview}
          aria-label={isPreviewing ? `Stop ${song.name}` : `Play ${song.name}`}
        >
          {isPreviewing ? 'Stop' : 'Play'}
        </button>
        <button type="button" className="card__button" onClick={onOpen}>
          Open
        </button>
        <button
          type="button"
          className="card__button"
          onClick={() => void duplicate(song)}
          aria-label={`Duplicate ${song.name}`}
        >
          Copy
        </button>
        <button
          type="button"
          className="card__button card__button--danger"
          onClick={onDelete}
          aria-label={`Delete ${song.name}`}
        >
          Delete
        </button>
      </div>
    </article>
  )
}
