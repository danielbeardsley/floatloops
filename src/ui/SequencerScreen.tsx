import { BeatInSong } from './BeatInSong'
import { Grid } from './Grid'
import { Transport } from './Transport'
import { useStopOnLeave } from './useStopOnLeave'

export function SequencerScreen() {
  useStopOnLeave()

  return (
    <div className="sequencer">
      <BeatInSong />
      <Transport />
      <Grid />
    </div>
  )
}
