import { screen, within } from '@testing-library/react'
import { expect } from 'vitest'

/** The finish cards of a type page: links to the finishes' combos pages. */
export const finishCards = () =>
  screen.getAllByRole('link').filter((link) => link.getAttribute('href')?.endsWith('/combos'))

/** A finish card with no count: only its name, and no strip. */
export function expectNoCount(card: HTMLElement) {
  expect(card.textContent).toBe(within(card).getByRole('heading').textContent)
  expect(card.querySelector('p')).toBeNull()
}
