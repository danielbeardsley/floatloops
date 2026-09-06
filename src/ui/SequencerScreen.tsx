import { Grid } from './Grid'
import { Transport } from './Transport'
import { useStopOnLeave } from './useStopOnLeave'

export function SequencerScreen() {
  useStopOnLeave()

  return (
    <div className="sequencer">
      <Transport />
      <Grid />
    </div>
  )
}
