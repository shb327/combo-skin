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

/** The "Has combos" control keeps its space but cannot be seen, reached or used. */
export function expectNoControl() {
  expect(screen.queryByRole('checkbox')).toBeNull()
  const checkbox = screen.getByRole('checkbox', { hidden: true })
  expect(checkbox).not.toBeVisible()
  expect(checkbox).toBeDisabled()
  expect(checkbox.closest('label')).toHaveAttribute('aria-hidden', 'true')
}
