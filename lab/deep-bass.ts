/**
 * A bench for the Deep Bass voice: every number in DEEP_BASS_TUNING on a
 * slider, with a riff playing, so the sound can be dialled in by ear instead
 * of by editing a constant and reloading.
 *
 * Dev only. Vite serves any HTML under the project root, but the build is
 * given index.html alone, so nothing here ships. It calls the same voice and
 * the same engine the app does -- master gain and compressor included -- so
 * what it sounds like here is what it sounds like in a beat.
 *
 * Live in the sense that matters for a synth: a slider moved while the riff
 * runs is heard on the next note, since a note's shape is scheduled once, at
 * its start, and does not exist as anything adjustable after that.
 */

import { getEngine, unlock } from '../src/audio/context'
import { SCALE } from '../src/audio/scale'
import {
  DEEP_BASS_TUNING,
  deepBass,
  type DeepBassTuning,
} from '../src/audio/voices/deepBass'

type Knob = {
  key: keyof DeepBassTuning
  label: string
  min: number
  max: number
  step: number
  /** Shown under the slider, so the bench explains itself. */
  note?: string
}

/**
 * Ranges are wider than anything musical on purpose: hearing where a number
 * stops working is most of what a bench is for. They stay inside what the
 * voice will clamp to, so the slider never lies about what it is doing.
 */
const KNOBS: readonly Knob[] = [
  {
    key: 'octave',
    label: 'octave',
    min: 0.125,
    max: 2,
    step: 0.005,
    note: '0.5 is the octave down that makes it a bass; 1 plays the note as written.',
  },
  { key: 'attack', label: 'attack', min: 0.001, max: 0.2, step: 0.001, note: 'Seconds. Under about 0.005 it clicks.' },
  { key: 'decay', label: 'decay', min: 0.05, max: 10, step: 0.05, note: 'Seconds to fade out if held that long. Short values sag hard.' },
  { key: 'release', label: 'release', min: 0.01, max: 1, step: 0.01, note: 'Seconds. Long enough and one note runs into the next.' },
  { key: 'open', label: 'filter open', min: 1, max: 32, step: 0.1, note: 'Cutoff at the start, as a multiple of the pitch.' },
  { key: 'closed', label: 'filter closed', min: 0.5, max: 16, step: 0.05, note: 'And where it lands. Below 1 the note itself goes.' },
  { key: 'sweep', label: 'sweep', min: 0.005, max: 1, step: 0.005, note: 'Seconds for the drop. This is the punch.' },
  { key: 'q', label: 'resonance', min: 0.1, max: 20, step: 0.1, note: 'Past about 12 the filter sings its own note over the bass.' },
  { key: 'drive', label: 'drive', min: 0.01, max: 12, step: 0.01, note: 'The dirt. Past about 6 it is a square with a pitch.' },
  { key: 'level', label: 'level', min: 0, max: 1, step: 0.01, note: 'How loud the voice runs for a given note.' },
]

/** Pitches as indices into SCALE, with null for a rest. */
type Pattern = { name: string; steps: (number | null)[]; hold: number }

const PATTERNS: readonly Pattern[] = [
  { name: 'Offbeat house', steps: [0, null, 0, null, 3, null, 0, null], hold: 0.4 },
  { name: 'Straight eighths', steps: [0, 0, 0, 0, 3, 3, 1, 1], hold: 0.4 },
  { name: 'Walking', steps: [0, 2, 3, 4, 3, 2, 1, 0], hold: 0.5 },
  { name: 'Long notes', steps: [0, null, null, null, 3, null, null, null], hold: 3 },
  { name: 'One note', steps: [0, null, null, null, null, null, null, null], hold: 0.6 },
]

const STORAGE_KEY = 'floatloops.deepBassBench'

/** What the sliders currently say. Read fresh every time a note is scheduled. */
let tuning: DeepBassTuning = load()
let tempo = 120
let pattern = PATTERNS[0]

function load(): DeepBassTuning {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) return { ...DEEP_BASS_TUNING, ...JSON.parse(saved) }
  } catch {
    // A bench that will not open because of a stale value is worse than one
    // that forgets.
  }
  return { ...DEEP_BASS_TUNING }
}

function save(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tuning))
  } catch {
    // Private browsing. Nothing here is worth failing over.
  }
}

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id)
  if (!node) throw new Error(`missing #${id}`)
  return node as T
}

// The scope taps the master rather than sitting in the voice, so it shows
// what actually leaves the engine: compressor, other notes ringing on and all.
let analyser: AnalyserNode | null = null

function scope(): AnalyserNode {
  if (!analyser) {
    const { ctx, master } = getEngine()
    analyser = ctx.createAnalyser()
    analyser.fftSize = 2048
    master.connect(analyser)
  }
  return analyser
}

function play(freq: number, hold: number, when?: number): void {
  const { ctx, master } = getEngine()
  scope()
  deepBass(ctx, master, when ?? ctx.currentTime + 0.02, {
    freq,
    duration: hold,
    level: 0.8,
    tuning,
  })
}

/*
 * Scheduling: the same shape as the app's scheduler, kept separate because
 * this one has nothing to keep in step with. A timer looks a little way ahead
 * and hands the notes in that window to Web Audio, which is the only clock
 * accurate enough to play them.
 */
const LOOKAHEAD = 0.12
const TICK = 25

let timer: number | null = null
let nextStep = 0
let nextTime = 0

function stepSeconds(): number {
  return 60 / tempo / 2
}

function tick(): void {
  const { ctx } = getEngine()
  while (nextTime < ctx.currentTime + LOOKAHEAD) {
    const pitch = pattern.steps[nextStep % pattern.steps.length]
    if (pitch !== null) play(SCALE[pitch].freq, pattern.hold, nextTime)
    nextStep += 1
    nextTime += stepSeconds()
  }
}

async function start(): Promise<void> {
  await unlock()
  const { ctx } = getEngine()
  nextStep = 0
  nextTime = ctx.currentTime + 0.1
  tick()
  timer = window.setInterval(tick, TICK)
}

function stop(): void {
  if (timer !== null) window.clearInterval(timer)
  timer = null
}

function draw(): void {
  const canvas = el<HTMLCanvasElement>('scope')
  const g = canvas.getContext('2d')!
  const samples = new Float32Array(scope().fftSize)
  scope().getFloatTimeDomainData(samples)

  g.clearRect(0, 0, canvas.width, canvas.height)
  g.strokeStyle = '#2c2c3c'
  g.beginPath()
  g.moveTo(0, canvas.height / 2)
  g.lineTo(canvas.width, canvas.height / 2)
  g.stroke()

  g.strokeStyle = '#ff9d5c'
  g.lineWidth = 2
  g.beginPath()
  for (let i = 0; i < samples.length; i += 1) {
    const x = (i / samples.length) * canvas.width
    // Half height per unit, so a wave clipping at 1 fills the canvas exactly.
    const y = canvas.height / 2 - samples[i] * (canvas.height / 2)
    if (i === 0) g.moveTo(x, y)
    else g.lineTo(x, y)
  }
  g.stroke()

  requestAnimationFrame(draw)
}

function showCode(): void {
  const lines = KNOBS.map((knob) => `  ${knob.key}: ${round(tuning[knob.key], knob.step)},`)
  el('code').textContent = `export const DEEP_BASS_TUNING: DeepBassTuning = {\n${lines.join('\n')}\n}`
}

/** Slider values arrive as floats with a tail; show them as the step implies. */
function round(value: number, step: number): number {
  const places = Math.max(0, Math.ceil(-Math.log10(step)))
  return Number(value.toFixed(places))
}

function buildKnobs(): void {
  const host = el('knobs')
  for (const knob of KNOBS) {
    const label = document.createElement('label')
    label.textContent = knob.label
    label.htmlFor = `knob-${knob.key}`

    const slider = document.createElement('input')
    slider.type = 'range'
    slider.id = `knob-${knob.key}`
    slider.min = String(knob.min)
    slider.max = String(knob.max)
    slider.step = String(knob.step)
    slider.value = String(tuning[knob.key])

    const readout = document.createElement('output')
    readout.textContent = String(round(tuning[knob.key], knob.step))

    slider.addEventListener('input', () => {
      tuning = { ...tuning, [knob.key]: Number(slider.value) }
      readout.textContent = String(round(Number(slider.value), knob.step))
      save()
      showCode()
    })

    host.append(label, slider, readout)

    if (knob.note) {
      const note = document.createElement('div')
      note.className = 'note'
      note.textContent = knob.note
      host.append(note)
    }
  }
}

function syncKnobs(): void {
  for (const knob of KNOBS) {
    const slider = el<HTMLInputElement>(`knob-${knob.key}`)
    slider.value = String(tuning[knob.key])
    ;(slider.nextElementSibling as HTMLOutputElement).textContent = String(
      round(tuning[knob.key], knob.step),
    )
  }
}

function buildKeys(): void {
  const host = el('keys')
  // The bottom of the roll, which is where a bassline is drawn.
  for (const note of SCALE.slice(0, 6)) {
    const key = document.createElement('button')
    key.textContent = note.name
    key.addEventListener('click', async () => {
      await unlock()
      play(note.freq, 0.5)
    })
    host.append(key)
  }
}

function buildTransport(): void {
  const button = el<HTMLButtonElement>('play')
  button.addEventListener('click', async () => {
    if (timer === null) {
      await start()
      button.textContent = 'Stop'
      button.classList.add('playing')
    } else {
      stop()
      button.textContent = 'Play riff'
      button.classList.remove('playing')
    }
  })

  const picker = el<HTMLSelectElement>('pattern')
  for (const [i, option] of PATTERNS.entries()) {
    const item = document.createElement('option')
    item.value = String(i)
    item.textContent = option.name
    picker.append(item)
  }
  picker.addEventListener('change', () => {
    pattern = PATTERNS[Number(picker.value)]
  })

  const speed = el<HTMLInputElement>('tempo')
  const speedOut = el<HTMLOutputElement>('tempo-out')
  speed.value = String(tempo)
  speedOut.textContent = `${tempo} bpm`
  speed.addEventListener('input', () => {
    tempo = Number(speed.value)
    speedOut.textContent = `${tempo} bpm`
  })

  el('reset').addEventListener('click', () => {
    tuning = { ...DEEP_BASS_TUNING }
    save()
    syncKnobs()
    showCode()
  })
}

buildKnobs()
buildKeys()
buildTransport()
showCode()
requestAnimationFrame(draw)
