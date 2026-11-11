import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { CatalogImage } from './CatalogImage'

const OURS = 'http://localhost:9000/local-images/catalog/0123456789abcdef0123456789abcdef.png'
const GAME = 'https://community.akamai.steamstatic.com/economy/image/abc'

describe('CatalogImage', () => {
  it('shows our copy, then the game’s picture once if ours fails', () => {
    render(<CatalogImage src={OURS} fallback={GAME} alt="Karambit | Fade" />)
    const image = screen.getByRole('img', { name: 'Karambit | Fade' })
    expect(image).toHaveAttribute('src', OURS)
    expect(image).toHaveAttribute('referrerpolicy', 'no-referrer')
    fireEvent.error(image)
    expect(image).toHaveAttribute('src', GAME)
    // A failing fallback is left as it is: no loop back to our copy.
    fireEvent.error(image)
    fireEvent.error(image)
    expect(image).toHaveAttribute('src', GAME)
  })

  it('shows the game’s picture when there is no copy, and nothing with neither', () => {
    const { rerender } = render(<CatalogImage src={null} fallback={GAME} alt="Fade" />)
    expect(screen.getByRole('img', { name: 'Fade' })).toHaveAttribute('src', GAME)
    rerender(<CatalogImage src={null} fallback={null} alt="Fade" />)
    expect(screen.queryByRole('img')).toBeNull()
  })
})
