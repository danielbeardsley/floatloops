import { StepStrip } from './StepStrip'
import { Transport } from './Transport'
import './app.css'

export function App() {
  return (
    <div className="app">
      <header className="app__bar">
        <h1 className="app__title">FloatLoops</h1>
        <Transport />
      </header>
      <main className="app__main">
        <StepStrip />
      </main>
    </div>
  )
}
