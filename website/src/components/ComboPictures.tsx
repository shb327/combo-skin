import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode, type Ref, type RefObject } from 'react'
import { Box, Maximize2, Minimize2, X } from 'lucide-react'
import type { ComboItem, PublicCombo } from '@/api/client'
import { pictureUrl, screenshotSources } from '@/api/images'
import { ComboViewer, type ViewerHandlers } from '@/viewer/ComboViewer'
import { VIEWER_ORIGIN } from '@/viewer/messages'
import { viewerUrl } from '@/viewer/params'
import { useViewerState } from '@/viewer/state'
import { hasWebGL2, needsDataWarning } from '@/viewer/webgl'
import { itemName } from './comboText'

/** Cards are one column below 1024 px and two above. */
const SIZES = '(min-width: 1024px) 50vw, 100vw'

/** Called once when a combo's 3D view is drawn. Nothing passes it yet: it is where counting 3D
 * opens will go. */
export type OnViewerLoaded = (view: { comboId: string; ms: number | null }) => void

/** The top of a combo card: its screenshot (or the finish pictures), and "View in 3D", which
 * opens the combo in the 3D viewer in the same 16:9 box. The screenshot stays on top of the
 * viewer until the combo is drawn. */
export function ComboPictures({ combo, onLoaded }: { combo: PublicCombo; onLoaded?: OnViewerLoaded }) {
  const [state, dispatch] = useViewerState()
  const active = state.active?.comboId === combo.id ? state.active : null
  const name = `${itemName(combo.glove)} with ${itemName(combo.knife)}`
  const descriptionId = useId()
  const box = useRef<HTMLDivElement>(null)
  const viewButton = useRef<HTMLButtonElement>(null)
  const returnFocus = useRef(false)
  const offered = !state.noWebGL2 && !state.cannotDraw.has(combo.id) && hasWebGL2()

  const open = () => dispatch({ type: 'open', comboId: combo.id, warn: needsDataWarning() })
  const close = () => {
    returnFocus.current = true
    if (document.fullscreenElement && document.fullscreenElement === box.current) {
      document.exitFullscreen().catch(() => {})
    }
    dispatch({ type: 'close', comboId: combo.id })
  }

  // Leaving the page, or this finish, closes this card's view.
  useEffect(() => () => dispatch({ type: 'close', comboId: combo.id }), [dispatch, combo.id])

  // Back to "View in 3D" after closing this card's view (not when another card took over), or
  // to the box when the card no longer offers 3D.
  useEffect(() => {
    if (!active && returnFocus.current) {
      returnFocus.current = false
      ;(viewButton.current ?? box.current)?.focus()
    }
  }, [active])

  const attempt = active?.attempt ?? 0
  const handlers: ViewerHandlers = {
    onProgress: (loaded, total) => dispatch({ type: 'progress', comboId: combo.id, attempt, loaded, total }),
    onLoaded: (ms, first) => {
      dispatch({ type: 'loaded', comboId: combo.id, attempt })
      if (first) onLoaded?.({ comboId: combo.id, ms })
    },
    onRecovering: () => dispatch({ type: 'recovering', comboId: combo.id, attempt }),
    onFail: (failure) => dispatch({ type: 'fail', comboId: combo.id, attempt, failure }),
  }

  // Escape reaches the page only while focus is on the box's own controls: keys inside the
  // viewer stay in its own (cross-origin) document. In full screen the browser takes Escape.
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && active && !document.fullscreenElement) {
      event.preventDefault()
      close()
    }
  }

  const phase = active?.phase
  const viewing = phase === 'loading' || phase === 'loaded'
  const announcement =
    phase === 'loading'
      ? 'Loading 3D view'
      : phase === 'loaded'
        ? '3D view ready'
        : phase === 'error'
          ? (active?.failure?.text ?? '')
          : ''

  return (
    <div
      ref={box}
      tabIndex={-1}
      className="relative w-full aspect-video bg-white/5 overflow-hidden focus:outline-none"
      onKeyDown={onKeyDown}
    >
      {viewing && (
        <ComboViewer
          key={attempt}
          src={viewerUrl(VIEWER_ORIGIN, combo)}
          title={`${name} in 3D`}
          handlers={handlers}
        />
      )}
      {phase !== 'loaded' && (
        <div className={`absolute inset-0 ${phase === 'warning' ? 'opacity-40' : ''}`}>
          <ComboImage combo={combo} alt={name} />
        </div>
      )}

      {!active && offered && (
        <div className="absolute top-2 right-2 md:top-3 md:right-3">
          <span id={descriptionId} className="sr-only">
            {name}
          </span>
          <Control ref={viewButton} label="View in 3D" describedBy={descriptionId} onClick={open}>
            <Box aria-hidden className="w-4 h-4" />
            <span>View in 3D</span>
          </Control>
        </div>
      )}

      {phase === 'warning' && (
        <Warning onLoad={() => dispatch({ type: 'confirm', comboId: combo.id })} onCancel={close} />
      )}

      {viewing && <ViewControls box={box} onClose={close} />}

      {phase === 'loading' && active && <Progress {...active.progress} />}

      {phase === 'error' && active?.failure && (
        <ErrorStrip
          text={active.failure.text}
          onRetry={active.failure.retryable ? () => dispatch({ type: 'retry', comboId: combo.id }) : undefined}
          onDismiss={close}
        />
      )}

      <span role="status" className="sr-only">
        {announcement}
      </span>
    </div>
  )
}

/** The screenshot, or, without one or when it fails to load, the glove and the knife finish
 * pictures from the catalog side by side. */
function ComboImage({ combo, alt }: { combo: PublicCombo; alt: string }) {
  const [failed, setFailed] = useState(false)
  const sources = failed ? null : screenshotSources(combo.screenshot)
  if (sources) {
    return (
      <img
        src={sources.src}
        srcSet={sources.srcSet}
        sizes={SIZES}
        width={sources.width}
        height={sources.height}
        alt={alt}
        className="w-full h-full object-cover select-none"
        draggable={false}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
      />
    )
  }
  return (
    <div className="w-full h-full grid grid-cols-2">
      <Picture item={combo.glove} />
      <Picture item={combo.knife} />
    </div>
  )
}

/** A catalog picture, or an empty half when it is not on the image host. */
function Picture({ item }: { item: ComboItem }) {
  const url = pictureUrl(item.image_url)
  if (!url) return <div />
  return (
    <img
      src={url}
      alt={itemName(item)}
      className="w-full h-full object-contain p-4 select-none"
      draggable={false}
      loading="lazy"
      referrerPolicy="no-referrer"
    />
  )
}

/** The box's own controls: white at about 60% opacity over a soft shadow, like the screenshots'
 * watermark, and fully white on hover and focus. */
function Control({
  ref,
  label,
  describedBy,
  onClick,
  children,
}: {
  ref?: Ref<HTMLButtonElement>
  label: string
  describedBy?: string
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      aria-describedby={describedBy}
      title={label}
      onClick={onClick}
      className="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs md:text-sm font-semibold text-white/60 drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)] hover:text-white focus-visible:text-white focus-visible:outline-2 focus-visible:outline-white cursor-pointer transition-colors"
    >
      {children}
    </button>
  )
}

/** Full screen (where the browser allows it on an element) and close, in the top-right corner.
 * Focus moves to "Close 3D view" when the view opens. */
function ViewControls({ box, onClose }: { box: RefObject<HTMLDivElement | null>; onClose: () => void }) {
  const closeButton = useRef<HTMLButtonElement>(null)
  const [fullscreen, setFullscreen] = useState(false)

  useEffect(() => {
    closeButton.current?.focus()
    const onChange = () => setFullscreen(document.fullscreenElement === box.current)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [box])

  // Decided by the document, not the label, in case a `fullscreenchange` is still to come.
  const toggle = () => {
    // A browser may refuse either (no permission, or no longer in full screen): nothing changes.
    const settle = () => setFullscreen(!!document.fullscreenElement && document.fullscreenElement === box.current)
    if (document.fullscreenElement && document.fullscreenElement === box.current) {
      document.exitFullscreen().then(settle, settle)
    } else {
      box.current?.requestFullscreen().then(settle, settle)
    }
  }

  return (
    <div className="absolute top-2 right-2 md:top-3 md:right-3 flex gap-1">
      {document.fullscreenEnabled && (
        <Control label={fullscreen ? 'Exit full screen' : 'Full screen'} onClick={toggle}>
          {fullscreen ? <Minimize2 aria-hidden className="w-4 h-4" /> : <Maximize2 aria-hidden className="w-4 h-4" />}
        </Control>
      )}
      <Control ref={closeButton} label="Close 3D view" onClick={onClose}>
        <X aria-hidden className="w-4 h-4" />
      </Control>
    </div>
  )
}

/** "Loading 3D view…" and the files loaded so far, along the bottom of the screenshot. */
function Progress({ loaded, total }: { loaded: number; total: number }) {
  const percent = total > 0 ? Math.round((Math.min(loaded, total) / total) * 100) : 0
  return (
    <div className="absolute inset-x-0 bottom-0 p-2 md:p-3 bg-gradient-to-t from-black/60 to-transparent">
      <p className="text-white/80 text-xs md:text-sm mb-1.5">Loading 3D view…</p>
      <div
        role="progressbar"
        aria-label="3D view download"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className="h-1 w-full max-w-[60%] bg-white/20 rounded-full overflow-hidden"
      >
        <div className="h-full bg-white/60 transition-[width]" style={{ width: `${percent}%` }} />
      </div>
    </div>
  )
}

/** Before the first 3D view on a phone, a small screen or a data saver. */
function Warning({ onLoad, onCancel }: { onLoad: () => void; onCancel: () => void }) {
  const loadButton = useRef<HTMLButtonElement>(null)
  useEffect(() => loadButton.current?.focus(), [])
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-4 bg-black/50 text-center">
      <p className="text-white text-sm md:text-base">The 3D view downloads about 34 MB.</p>
      <div className="flex gap-2">
        <button
          ref={loadButton}
          type="button"
          onClick={onLoad}
          className="px-3 py-1.5 rounded-lg bg-white/20 text-white text-sm hover:bg-white/30 focus-visible:outline-2 focus-visible:outline-white cursor-pointer"
        >
          Load 3D view
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 rounded-lg text-white/80 text-sm hover:text-white focus-visible:outline-2 focus-visible:outline-white cursor-pointer"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

/** A failure: the page's own text, "Try again" when it may help, and Dismiss. */
function ErrorStrip({ text, onRetry, onDismiss }: { text: string; onRetry?: () => void; onDismiss: () => void }) {
  const first = useRef<HTMLButtonElement>(null)
  useEffect(() => first.current?.focus(), [])
  return (
    <div className="absolute inset-x-0 bottom-0 flex items-center gap-2 p-2 md:p-3 bg-black/70">
      <p className="flex-1 text-white text-xs md:text-sm">{text}</p>
      {onRetry && (
        <button
          ref={first}
          type="button"
          onClick={onRetry}
          className="px-2.5 py-1 rounded-md bg-white/15 text-white text-xs md:text-sm hover:bg-white/25 focus-visible:outline-2 focus-visible:outline-white cursor-pointer"
        >
          Try again
        </button>
      )}
      <Control ref={onRetry ? undefined : first} label="Dismiss" onClick={onDismiss}>
        <X aria-hidden className="w-4 h-4" />
      </Control>
    </div>
  )
}
