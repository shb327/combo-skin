/** Screenshot state badges: always text, never colour alone. */
import type { ScreenshotState } from './queries'
import { STATE_LABELS } from './screenshotState'

const BADGE = 'rounded-full border px-2 py-0.5 text-xs'
const STATE_CLASSES: Record<ScreenshotState['state'], string> = {
  none: 'border-white/15 text-white/60',
  waiting: 'border-white/30 text-white/80',
  done: 'border-accent text-accent',
  failed: 'border-red-400 text-red-300',
}

/** The state, and "Rendering" while a worker holds a claim on it. */
export function ScreenshotBadges({ state }: { state: ScreenshotState }) {
  return (
    <>
      <span data-testid="screenshot-badge" className={`${BADGE} ${STATE_CLASSES[state.state]}`}>
        <span className="sr-only">Screenshot: </span>
        {STATE_LABELS[state.state]}
      </span>
      {state.rendering && state.state !== 'done' && state.state !== 'failed' && (
        <span data-testid="screenshot-badge" className={`${BADGE} border-white/30 text-white/80`}>
          Rendering
        </span>
      )}
    </>
  )
}
