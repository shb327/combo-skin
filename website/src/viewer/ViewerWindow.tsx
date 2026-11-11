/** The 3D window: a modal dialog over the page with the combo's name and rating, the 3D view,
 * the game's actions and the map and agent choices. Loaded on the first "View in 3D" (with the
 * agent list), so its code is not in the page's main chunk.
 *
 * Until the combo is drawn the window shows the combo's screenshot with the progress; then the
 * screenshot fades out over 200 ms (at once with reduced motion). Each attempt is its own iframe
 * (`ComboViewer`); a change of map or agent is a `cs3d:load` in the same iframe, over the last
 * frame. Closing (Close, Escape, Escape forwarded from inside the view, Back, leaving the page)
 * goes through `onClose`, which the host turns into the address and the visit's state. */
import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type RefObject } from 'react'
import { Maximize2, Minimize2, X } from 'lucide-react'
import type { PublicCombo } from '@/api/client'
import { ComboImage } from '@/components/ComboImage'
import { itemName } from '@/components/comboText'
import { scoreColor } from '@/components/score'
import { ComboViewer, type ViewerCommands, type ViewerHandlers } from './ComboViewer'
import type { Capabilities } from './features'
import { VIEWER_ORIGIN, failureFor, unavailableText, type Action } from './messages'
import { viewerLoad, viewerUrl, type Choice } from './params'
import { useViewerState, type ActiveView } from './state'
import { ViewerControls } from './ViewerControls'

/** Called once per attempt, when its combo is first drawn: where counting 3D opens will go. */
export type OnViewerLoaded = (view: { comboId: string; ms: number | null }) => void

/** The screenshot's width in the window. */
const SIZES = '(min-width: 1024px) calc(100vw - 378px), (min-width: 768px) calc(100vw - 154px), 100vw'
const FADE_MS = 200

// Focus shows as the hover's background, not an outline: Close takes the focus when the window opens.
const HEADER_BUTTON =
  'flex items-center justify-center gap-1.5 min-h-11 min-w-11 roomy:min-h-9 roomy:min-w-9 px-2 rounded-lg ' +
  'text-white/70 text-sm hover:text-white hover:bg-white/10 focus-visible:outline-none focus-visible:text-white ' +
  'focus-visible:bg-white/10 ' +
  'cursor-pointer transition-colors'

const prefersReducedMotion = () =>
  typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

const touchFirst = () =>
  typeof window.matchMedia === 'function' && window.matchMedia('(hover: none) and (pointer: coarse)').matches

export default function ViewerWindow({
  combo,
  onClose,
  onLoaded,
}: {
  combo: PublicCombo
  onClose(): void
  onLoaded?: OnViewerLoaded
}) {
  const [state] = useViewerState()
  const active = state.active?.comboId === combo.id ? state.active : null
  const dialog = useRef<HTMLDialogElement>(null)
  // What goes full screen: the browsers' Fullscreen API refuses a dialog element itself.
  const frame = useRef<HTMLDivElement>(null)
  const closeButton = useRef<HTMLButtonElement>(null)
  const titleId = useId()
  const name = `${itemName(combo.glove)} with ${itemName(combo.knife)}`
  // Set by the view while an action can be played: F on the window's own controls.
  const inspect = useRef<(() => void) | null>(null)
  // A map or agent list is open: it takes Escape first.
  const listOpen = useRef(false)
  const latestClose = useRef(onClose)
  // Whether the window is still meant to be open, for a close the browser makes by itself.
  const activeRef = useRef(true)
  useEffect(() => {
    latestClose.current = onClose
  })
  useEffect(() => {
    activeRef.current = true
    return () => {
      activeRef.current = false
    }
  }, [])

  // Modal from the start: the page behind is inert and does not scroll; both undone on close.
  useLayoutEffect(() => {
    const element = dialog.current
    if (!element) return
    const root = document.documentElement.style
    const before = { overflow: root.overflow, scrollbarGutter: root.scrollbarGutter }
    root.overflow = 'hidden'
    root.scrollbarGutter = 'stable'
    if (!element.open) element.showModal()
    closeButton.current?.focus()
    return () => {
      if (element.open) element.close()
      root.overflow = before.overflow
      root.scrollbarGutter = before.scrollbarGutter
    }
  }, [])

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'f' && event.key !== 'F') return
    if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return
    const target = event.target as HTMLElement
    if (target.closest('input, textarea, select')) return
    if (inspect.current) {
      event.preventDefault()
      inspect.current()
    }
  }

  return (
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      onCancel={(event) => {
        // Escape on the window's own controls: the same close as the button, so the viewer is
        // cleaned up. An open map or agent list keeps it.
        event.preventDefault()
        if (!listOpen.current) latestClose.current()
      }}
      onClose={() => {
        // The browser closed the dialog by itself (Chrome may answer Escape without a cancelable
        // cancel event): close the window properly. A close event while the dialog is open again
        // is a stale one (the dialog was closed and reopened), and is ignored.
        if (dialog.current && !dialog.current.open && activeRef.current) latestClose.current()
      }}
      onKeyDown={onKeyDown}
      className={
        // On a phone the window fills the large viewport, so nothing of the page shows under a
        // browser toolbar that floats over it (iOS Safari); its contents keep to the dynamic
        // viewport and clear of the notch and home indicator.
        'viewer-window m-0 p-0 w-full max-w-none h-[100lvh] max-h-none bg-background text-white open:flex ' +
        'backdrop:bg-black/70 roomy:m-auto roomy:h-fit roomy:max-h-[100dvh] roomy:max-w-[100vw] ' +
        'roomy:rounded-xl roomy:border roomy:border-white/10'
      }
    >
      <div
        ref={frame}
        data-window
        className={
          'viewer-window-frame relative flex flex-col flex-none h-[100dvh] w-full min-w-0 min-h-0 bg-background ' +
          'pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] ' +
          'pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] ' +
          'roomy:flex-1 roomy:h-auto roomy:p-3 roomy:gap-2'
        }
      >
        <div className="flex items-start gap-2 px-3 pt-2 pb-2 roomy:p-0 short:absolute short:top-1 short:right-1 short:z-20 short:p-0">
          <div className="flex-1 min-w-0 flex items-center gap-2 short:hidden">
            <h2 id={titleId} className="text-sm roomy:text-base font-semibold text-white">
              {name}
            </h2>
            <span
              aria-label={`Rating ${combo.rating}`}
              className="shrink-0 px-2 py-0.5 rounded-full border border-current text-xs roomy:text-sm font-bold"
              style={{ color: scoreColor(combo.rating) }}
            >
              {combo.rating}
            </span>
          </div>
          <HeaderButtons frame={frame} closeButton={closeButton} onClose={onClose} />
        </div>
        {active && (
          <WindowBody
            key={active.attempt}
            combo={combo}
            name={name}
            active={active}
            inspectRef={inspect}
            listOpenRef={listOpen}
            onClose={onClose}
            onLoaded={onLoaded}
          />
        )}
      </div>
    </dialog>
  )
}

/** Full screen (on the window's contents, where the browser allows it on an element) and Close. */
function HeaderButtons({
  frame,
  closeButton,
  onClose,
}: {
  frame: RefObject<HTMLDivElement | null>
  closeButton: RefObject<HTMLButtonElement | null>
  onClose(): void
}) {
  const [fullscreen, setFullscreen] = useState(false)

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === frame.current)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [frame])

  // Decided by the document, not the label, in case a `fullscreenchange` is still to come.
  const toggle = () => {
    // A browser may refuse either (no permission, or no longer in full screen): nothing changes.
    const settle = () => setFullscreen(!!document.fullscreenElement && document.fullscreenElement === frame.current)
    if (document.fullscreenElement && document.fullscreenElement === frame.current) {
      document.exitFullscreen().then(settle, settle)
    } else {
      frame.current?.requestFullscreen().then(settle, settle)
    }
  }

  return (
    <div className="flex gap-1 shrink-0 short:drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
      {document.fullscreenEnabled && (
        <button
          type="button"
          aria-label={fullscreen ? 'Exit full screen' : 'Full screen'}
          title={fullscreen ? 'Exit full screen' : 'Full screen'}
          onClick={toggle}
          className={HEADER_BUTTON}
        >
          {fullscreen ? <Minimize2 aria-hidden className="w-4 h-4" /> : <Maximize2 aria-hidden className="w-4 h-4" />}
        </button>
      )}
      <button ref={closeButton} type="button" aria-label="Close" title="Close" onClick={onClose} className={HEADER_BUTTON}>
        <X aria-hidden className="w-5 h-5" />
      </button>
    </div>
  )
}

/** A change of map or agent the viewer could not draw: the last scene stays, with this note. */
interface Notice {
  text: string
  retry: Choice | null
}

const sameChoice = (a: Choice, b: Choice) => a.map === b.map && a.agent === b.agent

/** One attempt: its iframe, the screenshot over it until drawn, the messages, and the controls. */
function WindowBody({
  combo,
  name,
  active,
  inspectRef,
  listOpenRef,
  onClose,
  onLoaded,
}: {
  combo: PublicCombo
  name: string
  active: ActiveView
  inspectRef: RefObject<(() => void) | null>
  listOpenRef: RefObject<boolean>
  onClose(): void
  onLoaded?: OnViewerLoaded
}) {
  const [state, dispatch] = useViewerState()
  // The attempt opens with the visit's choice; later choices go by message.
  const [opened] = useState(state.choice)
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null)
  const [actions, setActions] = useState<Action[] | null>(null)
  const [drawn, setDrawn] = useState<Choice>(opened)
  const [pending, setPending] = useState<Choice | null>(null)
  const [changeProgress, setChangeProgress] = useState({ loaded: 0, total: 0 })
  const [notice, setNotice] = useState<Notice | null>(null)
  const [fading, setFading] = useState(false)
  // The choice of the load the viewer works on.
  const requested = useRef<Choice>(opened)
  const viewer = useRef<ViewerCommands>(null)
  const [hints] = useState(() => !touchFirst())

  const { comboId, attempt, phase } = active
  const viewing = phase === 'loading' || phase === 'loaded'
  const enabled = phase === 'loaded' && pending === null
  const at = { comboId, attempt }

  useEffect(() => {
    if (!fading) return
    const timer = setTimeout(() => setFading(false), FADE_MS)
    return () => clearTimeout(timer)
  }, [fading])

  useEffect(() => {
    inspectRef.current = enabled ? () => viewer.current?.play('inspect') : null
    return () => {
      inspectRef.current = null
    }
  })

  const load = (next: Choice) => {
    requested.current = next
    viewer.current?.load(viewerLoad(combo, next))
  }

  const change = (next: Choice) => {
    if (sameChoice(next, drawn) && pending === null) return
    setNotice(null)
    setPending(next)
    setChangeProgress({ loaded: 0, total: 0 })
    load(next)
  }

  const handlers: ViewerHandlers = {
    onReady: (found, webgl2) => {
      if (!webgl2) return dispatch({ type: 'fail', ...at, failure: failureFor('no-webgl2', false) })
      setCapabilities(found)
    },
    onProgress: (loaded, total) => {
      if (phase === 'loading') dispatch({ type: 'progress', ...at, loaded, total })
      else setChangeProgress({ loaded, total })
    },
    onLoaded: ({ ms, first, actions: built }) => {
      const now = requested.current
      setActions(built)
      setDrawn(now)
      setPending(null)
      if (!sameChoice(now, state.choice)) dispatch({ type: 'choose', choice: now })
      if (phase === 'loading') {
        dispatch({ type: 'loaded', ...at })
        if (!prefersReducedMotion()) setFading(true)
      }
      if (first) onLoaded?.({ comboId, ms })
    },
    onRecovering: () => dispatch({ type: 'recovering', ...at }),
    onError: (code, retryable, kept) => {
      const unavailable = unavailableText(code)
      const field = code === 'unknown-agent' ? 'agent' : 'map'
      if (unavailable && requested.current[field] !== null) {
        // The visitor's agent or map is refused: draw the default instead, and forget it.
        const fallback = { ...requested.current, [field]: null }
        dispatch({ type: 'choose', choice: { ...state.choice, [field]: null } })
        setNotice({ text: unavailable, retry: null })
        if (phase === 'loaded') setPending(fallback)
        return load(fallback)
      }
      if (kept && phase === 'loaded') {
        const retry = requested.current
        requested.current = drawn
        setPending(null)
        const what = retry.agent !== drawn.agent ? 'agent' : 'map'
        return setNotice({ text: `That ${what} couldn't be loaded.`, retry })
      }
      dispatch({ type: 'fail', ...at, failure: failureFor(code, retryable) })
    },
    onKey: (key) => {
      // In full screen the browser takes Escape first; a forwarded one does not close.
      if (key === 'Escape' && !document.fullscreenElement) onClose()
    },
  }

  const pendingText = pending && pending.agent !== drawn.agent ? 'Loading the agent…' : 'Loading the map…'
  const announcement =
    phase === 'loading'
      ? 'Loading 3D view'
      : phase === 'loaded'
        ? (notice?.text ?? '3D view ready')
        : phase === 'error'
          ? (active.failure?.text ?? '')
          : ''

  return (
    <>
      <div className="viewer-window-view relative flex-1 min-h-0 w-full roomy:flex-none roomy:aspect-video bg-black overflow-hidden roomy:rounded-lg">
        {viewing && (
          <ComboViewer
            ref={viewer}
            src={viewerUrl(VIEWER_ORIGIN, combo, opened)}
            title={`${name} in 3D`}
            handlers={handlers}
          />
        )}
        {(phase !== 'loaded' || fading) && (
          <div
            data-screenshot
            className={`absolute inset-0 ${phase === 'warning' ? 'opacity-40' : ''} ${phase === 'loaded' ? 'opacity-0 transition-opacity duration-200' : ''}`}
          >
            <ComboImage combo={combo} alt={name} sizes={SIZES} />
          </div>
        )}
        {phase === 'warning' && (
          <Warning
            dataWarning={active.dataWarning}
            onLoad={() => dispatch({ type: 'confirm', comboId })}
            onCancel={onClose}
          />
        )}
        {phase === 'loading' && <Progress {...active.progress} text="Loading 3D view…" />}
        {phase === 'loaded' && pending && <Progress {...changeProgress} text={pendingText} />}
        {phase === 'error' && active.failure && (
          <Strip
            text={active.failure.text}
            onRetry={active.failure.retryable ? () => dispatch({ type: 'retry', comboId }) : undefined}
            focus
          />
        )}
        {phase === 'loaded' && !pending && notice && (
          <Strip
            text={notice.text}
            onRetry={notice.retry ? () => change(notice.retry!) : undefined}
            onDismiss={() => setNotice(null)}
          />
        )}
        <span role="status" className="sr-only">
          {announcement}
        </span>
      </div>
      <div className="px-3 pt-2 pb-3 roomy:p-0">
        <ViewerControls
          capabilities={capabilities}
          actions={actions}
          enabled={enabled}
          hints={hints}
          drawn={pending ?? drawn}
          onPlay={(action) => viewer.current?.play(action)}
          onMap={(map) => change({ ...drawn, map })}
          onAgent={(agent) => change({ ...drawn, agent })}
          onListOpen={(open) => {
            listOpenRef.current = open
          }}
        />
      </div>
    </>
  )
}

/** The bar along the bottom of the view while a combo, map or agent loads. */
function Progress({ loaded, total, text }: { loaded: number; total: number; text: string }) {
  const percent = total > 0 ? Math.round((Math.min(loaded, total) / total) * 100) : 0
  return (
    <div className="absolute inset-x-0 bottom-0 p-2 roomy:p-3 bg-gradient-to-t from-black/60 to-transparent">
      <p className="text-white/80 text-xs roomy:text-sm mb-1.5">{text}</p>
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

/** Before loading: the download warning on phones, or only a click for a window opened from its
 * address. */
function Warning({ dataWarning, onLoad, onCancel }: { dataWarning: boolean; onLoad(): void; onCancel(): void }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-4 bg-black/50 text-center">
      {dataWarning && <p className="text-white text-sm roomy:text-base">The 3D view downloads about 34 MB.</p>}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onLoad}
          className="min-h-11 roomy:min-h-9 px-4 rounded-lg bg-white/20 text-white text-sm hover:bg-white/30 focus-visible:outline-2 focus-visible:outline-white cursor-pointer"
        >
          Load 3D view
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="min-h-11 roomy:min-h-9 px-4 rounded-lg text-white/80 text-sm hover:text-white focus-visible:outline-2 focus-visible:outline-white cursor-pointer"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

/** A failure or a note: the page's own text, "Try again" when it may help, and Dismiss for a
 * note. `focus`: takes the focus when shown (a failure). */
function Strip({
  text,
  onRetry,
  onDismiss,
  focus = false,
}: {
  text: string
  onRetry?: () => void
  onDismiss?: () => void
  focus?: boolean
}) {
  const retry = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (focus) retry.current?.focus()
  }, [focus])
  return (
    <div className="absolute inset-x-0 bottom-0 flex items-center gap-2 p-2 roomy:p-3 bg-black/70">
      <p className="flex-1 text-white text-xs roomy:text-sm">{text}</p>
      {onRetry && (
        <button
          ref={retry}
          type="button"
          onClick={onRetry}
          className="min-h-11 roomy:min-h-8 px-3 rounded-md bg-white/15 text-white text-xs roomy:text-sm hover:bg-white/25 focus-visible:outline-2 focus-visible:outline-white cursor-pointer"
        >
          Try again
        </button>
      )}
      {onDismiss && (
        <button type="button" aria-label="Dismiss" title="Dismiss" onClick={onDismiss} className={HEADER_BUTTON}>
          <X aria-hidden className="w-4 h-4" />
        </button>
      )}
    </div>
  )
}
