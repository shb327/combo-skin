/** The viewer's iframe for one attempt at one combo, and the messages it exchanges with it.
 *
 * Events are accepted only from VITE_VIEWER_ORIGIN, only from this iframe, and only with the id
 * of the URL's combo (null) or of this attempt's handshake. Commands go to that origin only. On
 * unmount the listener and timers go and the iframe is pointed at `about:blank` before React
 * removes it, so the viewer's WebGL context and memory are released. */
import { useEffect, useRef } from 'react'
import { READY_MS, STALL_MS, VIEWER_ORIGIN, failureFor, newId, readEvent, type Failure } from './messages'

export interface ViewerHandlers {
  onProgress(loaded: number, total: number): void
  onLoaded(ms: number | null): void
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
  // The latest handlers, without restarting the effect when the parent renders.
  const latest = useRef(handlers)
  useEffect(() => {
    latest.current = handlers
  })

  useEffect(() => {
    const frame = ref.current
    if (!frame) return
    const id = newId()
    let finished = false
    let timer: ReturnType<typeof setTimeout> | undefined

    const wait = (ms: number) => {
      clearTimeout(timer)
      timer = setTimeout(() => fail(failureFor('timeout', true)), ms)
    }
    const fail = (failure: Failure) => {
      if (finished) return
      finished = true
      clearTimeout(timer)
      latest.current.onFail(failure)
    }

    const onMessage = (event: MessageEvent) => {
      if (finished || event.origin !== VIEWER_ORIGIN || event.source !== frame.contentWindow) return
      const message = readEvent(event.data)
      if (!message || (message.id !== null && message.id !== id)) return
      switch (message.type) {
        case 'cs3d:ready':
          if (!message.webgl2) return fail(failureFor('no-webgl2', false))
          return wait(STALL_MS)
        case 'cs3d:state':
          return wait(STALL_MS)
        case 'cs3d:progress':
          wait(STALL_MS)
          return latest.current.onProgress(message.loaded, message.total)
        case 'cs3d:recovering':
          wait(STALL_MS)
          return latest.current.onRecovering()
        case 'cs3d:loaded':
          // Drawn: the viewer reports its own later failures; no time limit while it shows.
          clearTimeout(timer)
          return latest.current.onLoaded(message.ms)
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
    frame.src = src
    wait(READY_MS)
    return () => {
      finished = true
      clearTimeout(timer)
      window.removeEventListener('message', onMessage)
      frame.removeEventListener('load', onLoad)
      frame.src = 'about:blank'
    }
  }, [src])

  return (
    <iframe
      ref={ref}
      title={title}
      sandbox="allow-scripts allow-same-origin"
      className="absolute inset-0 w-full h-full border-0"
    />
  )
}
