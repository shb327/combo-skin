/** The viewer's iframe for one attempt at one combo, the commands the window sends it, and the
 * events it sends back.
 *
 * Events are accepted only from VITE_VIEWER_ORIGIN and only from this iframe. `cs3d:ready` and
 * `cs3d:key` carry no id. The other events belong to a load: the URL's combo (id null) until
 * the window sends a `cs3d:load`, then that load's id only, so events of a load the visitor has
 * moved on from are ignored. The handshake's id is accepted too. Commands go to that origin
 * only. On unmount the listener and timers go and the iframe is pointed at `about:blank` before
 * React removes it (a layout effect's cleanup runs while the iframe is still in the page), so the
 * viewer's WebGL context and memory are released.
 *
 * Time limits: `cs3d:ready` within 15 s of opening; then, while a load runs (the first, a
 * change of map or agent, or a reload after a lost GPU context), an event at least every 60 s;
 * none while a combo is drawn. */
import { useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type Ref } from 'react'
import type { Capabilities } from './features'
import { READY_MS, STALL_MS, VIEWER_ORIGIN, newId, readEvent, type Action } from './messages'

export interface LoadedEvent {
  ms: number | null
  /** The first time this attempt draws a combo (later ones follow a change or a recovery). */
  first: boolean
  actions: Action[] | null
}

export interface ViewerHandlers {
  onReady(capabilities: Capabilities, webgl2: boolean): void
  onProgress(loaded: number, total: number): void
  onLoaded(event: LoadedEvent): void
  onRecovering(): void
  /** A viewer error, or `timeout` for a viewer that stopped answering. The window decides what
   * it means; until the iframe goes, later events are still read. */
  onError(code: string, retryable: boolean, kept: boolean): void
  onKey(key: string): void
}

export interface ViewerCommands {
  /** Draws the same combo again with these fields (another map or agent). */
  load(fields: { combo: Record<string, string>; map?: string }): void
  play(action: Action): void
}

export function ComboViewer({
  src,
  title,
  handlers,
  ref,
}: {
  src: string
  title: string
  handlers: ViewerHandlers
  ref?: Ref<ViewerCommands>
}) {
  const frameRef = useRef<HTMLIFrameElement>(null)
  // One attempt starts from one address: a refetch or a new choice does not reload the viewer.
  const [address] = useState(src)
  // The latest handlers, without restarting the effect when the parent renders.
  const latest = useRef(handlers)
  useEffect(() => {
    latest.current = handlers
  })
  const commands = useRef<ViewerCommands | null>(null)
  useImperativeHandle(
    ref,
    () => ({
      load: (fields) => commands.current?.load(fields),
      play: (action) => commands.current?.play(action),
    }),
    [],
  )

  useLayoutEffect(() => {
    const frame = frameRef.current
    if (!frame) return
    const handshake = newId()
    /** The load whose events are read: null for the URL's combo. */
    let load: string | null = null
    let stopped = false
    let answered = false
    let loading = true
    let drawn = false
    let stallTimer: ReturnType<typeof setTimeout> | undefined

    const post = (message: Record<string, unknown>) => frame.contentWindow?.postMessage(message, VIEWER_ORIGIN)
    const timeout = () => {
      if (stopped) return
      stopped = true
      clearTimeout(readyTimer)
      clearTimeout(stallTimer)
      latest.current.onError('timeout', true, false)
    }
    const readyTimer = setTimeout(timeout, READY_MS)
    // Restarts the 60 s limit, only once the viewer has answered and while a load runs.
    const alive = () => {
      if (!answered || !loading) return
      clearTimeout(stallTimer)
      stallTimer = setTimeout(timeout, STALL_MS)
    }

    commands.current = {
      load(fields) {
        if (stopped) return
        load = newId()
        loading = true
        alive()
        post({ type: 'cs3d:load', id: load, ...fields })
      },
      play(action) {
        if (stopped) return
        post(
          action === 'inspect'
            ? { type: 'cs3d:inspect', id: newId() }
            : { type: 'cs3d:attack', id: newId(), attack: action },
        )
      },
    }

    const onMessage = (event: MessageEvent) => {
      if (stopped || event.origin !== VIEWER_ORIGIN || event.source !== frame.contentWindow) return
      const message = readEvent(event.data)
      if (!message) return
      if (message.type === 'cs3d:ready') {
        if (answered) return
        answered = true
        clearTimeout(readyTimer)
        alive()
        return latest.current.onReady(message.capabilities, message.webgl2)
      }
      if (message.type === 'cs3d:key') {
        if (message.id === null) latest.current.onKey(message.key)
        return
      }
      if (message.id !== load && message.id !== handshake) return
      switch (message.type) {
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
          latest.current.onLoaded({ ms: message.ms, first: !drawn, actions: message.actions })
          drawn = true
          return
        case 'cs3d:error':
          loading = false
          clearTimeout(stallTimer)
          return latest.current.onError(message.code, message.retryable, message.kept)
      }
    }

    // Starts the handshake if the viewer could not tell its parent's origin by itself. A
    // message sent while the iframe still shows `about:blank` is dropped by the browser.
    const onLoad = () => post({ type: 'cs3d:getState', id: handshake })

    window.addEventListener('message', onMessage)
    frame.addEventListener('load', onLoad)
    frame.src = address
    return () => {
      stopped = true
      commands.current = null
      clearTimeout(readyTimer)
      clearTimeout(stallTimer)
      window.removeEventListener('message', onMessage)
      frame.removeEventListener('load', onLoad)
      frame.src = 'about:blank'
    }
  }, [address])

  return (
    <iframe
      ref={frameRef}
      title={title}
      sandbox="allow-scripts allow-same-origin"
      className="absolute inset-0 w-full h-full border-0"
    />
  )
}
