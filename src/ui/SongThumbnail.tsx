import type { Song } from '../state/song'
import { rowColor } from './songCells'

/**
 * The song's shape: where each beat comes in and how long it runs. The same
 * idea as a beat's thumbnail -- a kid recognises the picture long before the
 * name.
 */
export function SongThumbnail({ song }: { song: Song }) {
  const height = Math.max(1, song.rows.length)

  return (
    <svg
      className="thumb"
      viewBox={`0 0 ${song.bars} ${height}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={`Song shape for ${song.name}`}
    >
      {song.rows.map((row, index) =>
        row.clips.map((clip) => (
          <rect
            key={clip.id}
            x={clip.start + 0.06}
            y={index + 0.15}
            width={clip.length - 0.12}
            height={0.7}
            rx={0.25}
            fill={rowColor(index)}
            opacity={row.muted ? 0.25 : 0.85}
          />
        )),
      )}
    </svg>
  )
}
