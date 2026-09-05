import { Grid } from './Grid'
import { Transport } from './Transport'

export function SequencerScreen() {
  return (
    <div className="sequencer">
      <Transport />
      <Grid />
    </div>
  )
}
