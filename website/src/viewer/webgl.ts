/** What the visitor's device can and should load before "View in 3D" is offered or opened. */

let webgl2: boolean | undefined

/** Whether the browser has WebGL2, checked once per page load on first need: a detached canvas
 * is asked for a `webgl2` context, which is released at once. Any exception means no. */
export function hasWebGL2(): boolean {
  if (webgl2 === undefined) webgl2 = probeWebGL2()
  return webgl2
}

function probeWebGL2(): boolean {
  try {
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('webgl2')
    if (!context) return false
    // A context holds GPU resources until it is collected; give them back now.
    context.getExtension('WEBGL_lose_context')?.loseContext()
    return true
  } catch {
    return false
  }
}

/** For tests: forget the result, so the next call checks again. */
export function forgetWebGL2(): void {
  webgl2 = undefined
}

const SMALL_OR_TOUCH = '(max-width: 767px), (pointer: coarse)'

/** A narrow screen, a touch-first device, or a browser asking to save data: the visitor is told
 * about the download before the first 3D view. */
export function needsDataWarning(): boolean {
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection
  if (connection?.saveData === true) return true
  return typeof window.matchMedia === 'function' && window.matchMedia(SMALL_OR_TOUCH).matches
}
