/** The viewer's iframe for one attempt at one combo, and the messages it exchanges with it.
 *
 * Events are accepted only from VITE_VIEWER_ORIGIN, only from this iframe, and only with the id
 * of the URL's combo (null) or of this attempt's handshake. Commands go to that origin only. On
 * unmount the listener and timers go and the iframe is pointed at `about:blank` before React
 * removes it (a layout effect's cleanup runs while the iframe is still in the page), so the
 * viewer's WebGL context and memory are released.
 *
 * Time limits: `cs3d:ready` within 15 s of opening; then, while the combo loads (or reloads
 * after a lost GPU context), an event at least every 60 s; none once it is drawn. */
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { READY_MS, STALL_MS, VIEWER_ORIGIN, failureFor, newId, readEvent, type Failure } from './messages'

export interface ViewerHandlers {
  onProgress(loaded: number, total: number): void
  /** `first`: the first time this attempt's combo is drawn (later ones follow a recovery). */
  onLoaded(ms: number | null, first: boolean): void
  onRecovering(): void
  onFail(failure: Failure): void
}

export function ComboViewer({
  src,
  title,
  handlers,
}: {
  src: string
  title: string
  handlers: ViewerHandlers
}) {
  const ref = useRef<HTMLIFrameElement>(null)
  // One attempt shows one combo: a refetch that changes it does not reload the open viewer.
  const [address] = useState(src)
  // The latest handlers, without restarting the effect when the parent renders.
  const latest = useRef(handlers)
  useEffect(() => {
    latest.current = handlers
  })

  useLayoutEffect(() => {
    const frame = ref.current
    if (!frame) return
    const id = newId()
    let finished = false
    let answered = false
    let loading = true
    let drawn = false
    let stallTimer: ReturnType<typeof setTimeout> | undefined

    const fail = (failure: Failure) => {
      if (finished) return
      finished = true
      clearTimeout(readyTimer)
      clearTimeout(stallTimer)
      latest.current.onFail(failure)
    }
    const timeout = () => fail(failureFor('timeout', true))
    const readyTimer = setTimeout(timeout, READY_MS)
    // Restarts the 60 s limit, only once the viewer has answered and while the combo loads.
    const alive = () => {
      if (!answered || !loading) return
      clearTimeout(stallTimer)
      stallTimer = setTimeout(timeout, STALL_MS)
    }

    const onMessage = (event: MessageEvent) => {
      if (finished || event.origin !== VIEWER_ORIGIN || event.source !== frame.contentWindow) return
      const message = readEvent(event.data)
      if (!message || (message.id !== null && message.id !== id)) return
      switch (message.type) {
        case 'cs3d:ready':
          if (!message.webgl2) return fail(failureFor('no-webgl2', false))
          answered = true
          clearTimeout(readyTimer)
          return alive()
        case 'cs3d:state':
          return alive()
        case 'cs3d:progress':
          alive()
          return latest.current.onProgress(message.loaded, message.total)
        case 'cs3d:recovering':
          loading = true
          alive()
          return latest.current.onRecovering()
        case 'cs3d:loaded':
          // Drawn: the viewer reports its own later failures; no time limit while it shows.
          loading = false
          clearTimeout(stallTimer)
          latest.current.onLoaded(message.ms, !drawn)
          drawn = true
          return
        case 'cs3d:error':
          return fail(failureFor(message.code, message.retryable))
      }
    }

    // Starts the handshake if the viewer could not tell its parent's origin by itself. A
    // message sent while the iframe still shows `about:blank` is dropped by the browser.
    const onLoad = () => {
      frame.contentWindow?.postMessage({ type: 'cs3d:getState', id }, VIEWER_ORIGIN)
    }

    window.addEventListener('message', onMessage)
    frame.addEventListener('load', onLoad)
    frame.src = address
    return () => {
      finished = true
      clearTimeout(readyTimer)
      clearTimeout(stallTimer)
      window.removeEventListener('message', onMessage)
      frame.removeEventListener('load', onLoad)
      frame.src = 'about:blank'
    }
  }, [address])

  return (
    <iframe
      ref={ref}
      title={title}
      sandbox="allow-scripts allow-same-origin"
      className="absolute inset-0 w-full h-full border-0"
    />
  )
}
