import { useEffect, useRef } from 'react'

export type MoveAction = 'up' | 'down'

/** `slugs` with `slug` moved to position `to` (from 0). */
export function moveSlug(slugs: string[], slug: string, to: number): string[] {
  const next = slugs.filter((s) => s !== slug)
  next.splice(to, 0, slug)
  return next
}

/** What the live region says after a move. */
export const movedText = (name: string, to: number) => `${name} moved to position ${to + 1}.`

/** Puts focus back on the button a move was made with once the list has moved; at the top or
 * bottom of the list that button is gone, so the other one. A move made with a position list
 * leaves focus on the list. */
export function useMoveFocus() {
  const focus = useRef<{ slug: string; action: MoveAction } | null>(null)
  const buttons = useRef(new Map<string, HTMLButtonElement>())

  useEffect(() => {
    const target = focus.current
    if (!target) return
    focus.current = null
    const other: MoveAction = target.action === 'up' ? 'down' : 'up'
    ;(buttons.current.get(`${target.slug}:${target.action}`) ?? buttons.current.get(`${target.slug}:${other}`))?.focus()
  })

  return {
    /** Call with each move; `action` is the button used, if any. */
    moved(slug: string, action?: MoveAction) {
      focus.current = action ? { slug, action } : null
    },
    button: (slug: string, action: MoveAction) => (el: HTMLButtonElement | null) => {
      if (el) buttons.current.set(`${slug}:${action}`, el)
      else buttons.current.delete(`${slug}:${action}`)
    },
  }
}
