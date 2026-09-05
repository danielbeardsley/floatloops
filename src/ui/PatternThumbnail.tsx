import { getVoice } from '../audio/kit'
import { totalSteps, type Pattern } from '../state/schema'

/**
 * A tiny picture of the pattern itself. Kids remember a beat by its shape long
 * before they remember what they called it.
 */
export function PatternThumbnail({ pattern }: { pattern: Pattern }) {
  const width = totalSteps(pattern)
  const height = pattern.tracks.length

  return (
    <svg
      className="thumb"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={`Pattern shape for ${pattern.name}`}
    >
      {pattern.tracks.map((track, row) =>
        track.steps.map((velocity, step) =>
          velocity > 0 ? (
            <rect
              key={`${track.voiceId}-${step}`}
              x={step + 0.1}
              y={row + 0.15}
              width={0.8}
              height={0.7}
              rx={0.2}
              fill={getVoice(track.voiceId).color}
              opacity={0.4 + 0.6 * velocity}
            />
          ) : null,
        ),
      )}
    </svg>
  )
}
