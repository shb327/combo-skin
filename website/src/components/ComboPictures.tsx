import { useId, type ReactNode } from 'react'
import { Box } from 'lucide-react'
import type { PublicCombo } from '@/api/client'
import { useOpenViewer } from '@/viewer/open'
import { useViewerState } from '@/viewer/state'
import { hasWebGL2 } from '@/viewer/webgl'
import { ComboImage } from './ComboImage'
import { itemName } from './comboText'

/** Cards are one column below 1024 px and two above. */
const SIZES = '(min-width: 1024px) 50vw, 100vw'

/** The top of a combo card: its screenshot (or the finish pictures), and "View in 3D", which
 * opens the combo in the 3D window over the page. The card keeps its screenshot. */
export function ComboPictures({ combo }: { combo: PublicCombo }) {
  const [state] = useViewerState()
  const open = useOpenViewer()
  const name = `${itemName(combo.glove)} with ${itemName(combo.knife)}`
  const descriptionId = useId()
  const offered = open !== null && !state.noWebGL2 && !state.cannotDraw.has(combo.id) && hasWebGL2()

  return (
    <div className="relative w-full aspect-video bg-white/5 overflow-hidden">
      <ComboImage combo={combo} alt={name} sizes={SIZES} />
      {offered && (
        <div className="absolute top-2 right-2 md:top-3 md:right-3">
          <span id={descriptionId} className="sr-only">
            {name}
          </span>
          <Control label="View in 3D" describedBy={descriptionId} onClick={() => open(combo.id)}>
            <Box aria-hidden className="w-4 h-4" />
            <span>View in 3D</span>
          </Control>
        </div>
      )}
    </div>
  )
}

/** The box's control: white at about 60% opacity over a soft shadow, like the screenshots'
 * watermark, and fully white on hover and focus. */
function Control({
  label,
  describedBy,
  onClick,
  children,
}: {
  label: string
  describedBy?: string
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-describedby={describedBy}
      title={label}
      onClick={onClick}
      className="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs md:text-sm font-semibold text-white/60 drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)] hover:text-white focus-visible:text-white cursor-pointer transition-colors"
    >
      {children}
    </button>
  )
}
