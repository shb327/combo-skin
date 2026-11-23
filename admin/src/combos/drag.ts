import { KeyboardSensor, MouseSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'

/** The sensors of a list ordered by dragging a handle (spec 017, 024): the mouse after a 5 px
 * move, touch after a 250 ms press and hold, and the keyboard (Space, Up, Down, Space, Escape).
 * `scrollBehavior` is how a keyboard move scrolls the page: a list of tall rows scrolls at once,
 * since a key pressed while a smooth scroll runs is measured against the old place. */
export function useDragSensors({ scrollBehavior = 'smooth' }: { scrollBehavior?: ScrollBehavior } = {}) {
  return useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates, scrollBehavior }),
  )
}
