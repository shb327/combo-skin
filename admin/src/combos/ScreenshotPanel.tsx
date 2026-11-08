import { useState } from 'react'
import { useApi } from '../api/useApi'
import { comboErrorMessage } from './messages'
import { useComboWrites, type AdminCombo } from './queries'
import { ScreenshotBadges } from './ScreenshotBadges'
import { REASONS, screenshotImage } from './screenshotState'
import { SECONDARY } from './styles'

/** A combo's screenshot on its edit page: the 1280 version, its state and why it failed, and a
 * way to ask for a new one. Asking needs no confirmation: nothing public changes until the new
 * screenshot arrives. */
export function ScreenshotPanel({ combo }: { combo: AdminCombo }) {
  const api = useApi()
  const writes = useComboWrites()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const image = screenshotImage(combo)
  const state = combo.screenshot_state

  async function ask() {
    setBusy(true)
    setMessage(null)
    setFailure(null)
    try {
      await api.request('post', '/admin/screenshots/request', { body: { ids: [combo.id] } })
      setMessage('A new screenshot is on its way.')
      await writes()
    } catch (error) {
      setFailure(comboErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section aria-label="Screenshot" className="mt-4 max-w-2xl rounded-lg border border-white/10 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-semibold">Screenshot</h2>
        <ScreenshotBadges state={state} />
      </div>
      {image ? (
        <img
          src={image.src}
          width={image.width}
          height={image.height}
          alt={`Screenshot of ${combo.glove.type_name} | ${combo.glove.display_name} with ${combo.knife.type_name} | ${combo.knife.display_name}`}
          className="mt-3 h-auto w-full rounded-md bg-white/5"
          referrerPolicy="no-referrer"
        />
      ) : (
        <p className="mt-2 text-sm text-white/70">No screenshot yet.</p>
      )}
      {state.reason && state.attempts > 0 && <p className="mt-2 text-sm text-white/70">{REASONS[state.reason]}</p>}
      <button type="button" className={`${SECONDARY} mt-3`} disabled={busy} onClick={() => void ask()}>
        Ask for a new screenshot
      </button>
      {message && (
        <p role="status" className="mt-2 text-sm text-accent">
          {message}
        </p>
      )}
      {failure && (
        <p role="alert" className="mt-2 rounded-md bg-red-500/10 px-3 py-2 text-sm">
          {failure}
        </p>
      )}
    </section>
  )
}
