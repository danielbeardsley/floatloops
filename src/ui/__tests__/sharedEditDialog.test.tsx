import { beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { SharedEditDialog } from '../SharedEditDialog'
import { useSharedEditPrompt, type SharedEdit, type SharedEditRequest } from '../sharedBeat'
import { demoPattern } from '../../state/schema'
import { addRow, createEmptySong, type Song } from '../../state/song'

const beat = { ...demoPattern(), id: 'boom', name: 'Boom' }

function song(name: string): Song {
  return addRow(createEmptySong(name), 'boom')
}

function ask(request: Partial<SharedEditRequest> = {}): Promise<SharedEdit> {
  const using = request.using ?? [song('Rocket'), song('Bath Time')]
  return useSharedEditPrompt.getState().ask({
    pattern: beat,
    using,
    inOpen: null,
    others: using,
    ...request,
  })
}

beforeEach(() => {
  useSharedEditPrompt.setState({ request: null, answer: null })
})

describe('the shared-beat question', () => {
  it('stays out of the way until something asks', () => {
    render(<SharedEditDialog />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('names the beat and how many songs play it', () => {
    void ask()
    render(<SharedEditDialog />)
    expect(screen.getByRole('dialog')).toHaveTextContent('“Boom” plays in 2 songs')
  })

  it('names the song itself when only one plays it', () => {
    const using = [song('Rocket')]
    void ask({ using, others: using })
    render(<SharedEditDialog />)
    expect(screen.getByRole('dialog')).toHaveTextContent('“Boom” plays in Rocket')
  })

  // Both buttons save. The choice is what gets saved, so neither is a "no".
  it('offers two saves, not a yes and a no', () => {
    void ask()
    render(<SharedEditDialog />)
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save as a copy' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /cancel/i })).not.toBeInTheDocument()
  })

  it('says which song the copy would be for, and what it would leave alone', () => {
    const rocket = song('Rocket')
    const others = [song('Bath Time'), song('Dinosaurs')]
    void ask({ using: [rocket, ...others], inOpen: rocket, others })
    render(<SharedEditDialog />)

    expect(screen.getByRole('dialog')).toHaveTextContent(
      'A copy would play in Rocket only, and leave the other 2 songs as they are',
    )
  })

  it('says a copy would be a new beat when no song is open', () => {
    void ask()
    render(<SharedEditDialog />)
    expect(screen.getByRole('dialog')).toHaveTextContent('A copy would be a new beat')
  })

  it('answers the save with the button that was pressed', async () => {
    const answer = ask()
    render(<SharedEditDialog />)

    fireEvent.click(screen.getByRole('button', { name: 'Save as a copy' }))

    await expect(answer).resolves.toBe('copy')
  })

  it('answers with the plain save too, and closes either way', async () => {
    const answer = ask()
    const { rerender } = render(<SharedEditDialog />)

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await expect(answer).resolves.toBe('everywhere')
    rerender(<SharedEditDialog />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
