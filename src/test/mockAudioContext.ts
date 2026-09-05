/**
 * A minimal fake Web Audio graph. jsdom has no AudioContext, and we care about
 * *what was scheduled* rather than the sound, so recording the calls is enough.
 */

export type ParamEvent = {
  method: 'setValueAtTime' | 'linearRampToValueAtTime' | 'exponentialRampToValueAtTime'
  value: number
  time: number
}

export class MockAudioParam {
  events: ParamEvent[] = []
  value = 0

  setValueAtTime(value: number, time: number): this {
    this.events.push({ method: 'setValueAtTime', value, time })
    this.value = value
    return this
  }

  linearRampToValueAtTime(value: number, time: number): this {
    this.events.push({ method: 'linearRampToValueAtTime', value, time })
    this.value = value
    return this
  }

  exponentialRampToValueAtTime(value: number, time: number): this {
    this.events.push({ method: 'exponentialRampToValueAtTime', value, time })
    this.value = value
    return this
  }
}

export class MockAudioNode {
  readonly outputs: MockAudioNode[] = []
  disconnected = false

  connect<T extends MockAudioNode>(destination: T): T {
    this.outputs.push(destination)
    return destination
  }

  disconnect(): void {
    this.disconnected = true
  }
}

export class MockGainNode extends MockAudioNode {
  readonly gain = new MockAudioParam()
}

export class MockOscillatorNode extends MockAudioNode {
  type = 'sine'
  readonly frequency = new MockAudioParam()
  startedAt: number | null = null
  stoppedAt: number | null = null
  onended: (() => void) | null = null

  start(time: number): void {
    this.startedAt = time
  }

  stop(time: number): void {
    this.stoppedAt = time
  }

  /** Fires the tail-end cleanup the real node would fire on its own. */
  finish(): void {
    this.onended?.()
  }
}

export class MockBiquadFilterNode extends MockAudioNode {
  type = 'lowpass'
  readonly frequency = new MockAudioParam()
  readonly Q = new MockAudioParam()
  readonly gain = new MockAudioParam()
}

export class MockAudioBuffer {
  constructor(
    readonly numberOfChannels: number,
    readonly length: number,
    readonly sampleRate: number,
  ) {}

  private readonly channels = new Map<number, Float32Array>()

  getChannelData(channel: number): Float32Array {
    let data = this.channels.get(channel)
    if (!data) {
      data = new Float32Array(this.length)
      this.channels.set(channel, data)
    }
    return data
  }
}

export class MockAudioBufferSourceNode extends MockAudioNode {
  buffer: MockAudioBuffer | null = null
  loop = false
  startedAt: number | null = null
  stoppedAt: number | null = null
  onended: (() => void) | null = null

  start(time: number): void {
    this.startedAt = time
  }

  stop(time: number): void {
    this.stoppedAt = time
  }

  /** Fires the tail-end cleanup the real node would fire on its own. */
  finish(): void {
    this.onended?.()
  }
}

export class MockDynamicsCompressorNode extends MockAudioNode {
  readonly threshold = new MockAudioParam()
  readonly knee = new MockAudioParam()
  readonly ratio = new MockAudioParam()
  readonly attack = new MockAudioParam()
  readonly release = new MockAudioParam()
}

export class MockAudioContext {
  currentTime = 0
  sampleRate = 48000
  state: AudioContextState = 'suspended'
  readonly destination = new MockAudioNode()

  readonly oscillators: MockOscillatorNode[] = []
  readonly gains: MockGainNode[] = []
  readonly compressors: MockDynamicsCompressorNode[] = []
  readonly filters: MockBiquadFilterNode[] = []
  readonly bufferSources: MockAudioBufferSourceNode[] = []
  readonly buffers: MockAudioBuffer[] = []

  createOscillator(): MockOscillatorNode {
    const node = new MockOscillatorNode()
    this.oscillators.push(node)
    return node
  }

  createGain(): MockGainNode {
    const node = new MockGainNode()
    this.gains.push(node)
    return node
  }

  createBiquadFilter(): MockBiquadFilterNode {
    const node = new MockBiquadFilterNode()
    this.filters.push(node)
    return node
  }

  createBufferSource(): MockAudioBufferSourceNode {
    const node = new MockAudioBufferSourceNode()
    this.bufferSources.push(node)
    return node
  }

  createBuffer(numberOfChannels: number, length: number, sampleRate: number): MockAudioBuffer {
    const buffer = new MockAudioBuffer(numberOfChannels, length, sampleRate)
    this.buffers.push(buffer)
    return buffer
  }

  createDynamicsCompressor(): MockDynamicsCompressorNode {
    const node = new MockDynamicsCompressorNode()
    this.compressors.push(node)
    return node
  }

  async resume(): Promise<void> {
    this.state = 'running'
  }

  async suspend(): Promise<void> {
    this.state = 'suspended'
  }

  async close(): Promise<void> {
    this.state = 'closed'
  }
}

/** The mocks are structural stand-ins; the casts keep call sites readable. */
export function asAudioContext(ctx: MockAudioContext): AudioContext {
  return ctx as unknown as AudioContext
}

export function asAudioNode(node: MockAudioNode): AudioNode {
  return node as unknown as AudioNode
}

/** Every source node the context handed out, in creation order. */
export function allSources(ctx: MockAudioContext): Array<MockOscillatorNode | MockAudioBufferSourceNode> {
  return [...ctx.oscillators, ...ctx.bufferSources]
}
