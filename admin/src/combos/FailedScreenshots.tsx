import { useState } from 'react'
import { Link } from 'react-router'
import { useApi } from '../api/useApi'
import { comboErrorMessage } from './messages'
import { finishLabel, useComboWrites, useCombos } from './queries'
import { REASONS } from './screenshotState'
import { LINK, SECONDARY } from './styles'
import { QueryState } from './ui'

/** Combos whose screenshot failed three times for their current render inputs. */
export function FailedScreenshots() {
  const api = useApi()
  const writes = useComboWrites()
  const combos = useCombos({})
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const failed = (combos.data ?? []).filter((combo) => combo.screenshot_state.state === 'failed')

  async function askAgain() {
    setBusy(true)
    setMessage(null)
    setFailure(null)
    try {
      const { data } = await api.request('post', '/admin/screenshots/request', {
        body: { ids: failed.map((combo) => combo.id) },
      })
      const changed = data?.changed ?? 0
      setMessage(`Asked again for ${changed} ${changed === 1 ? 'screenshot' : 'screenshots'}.`)
      await writes()
    } catch (error) {
      setFailure(comboErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section aria-label="Failed screenshots" className="mt-8">
      <h2 className="text-lg font-semibold">Failed screenshots</h2>
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
      {!combos.data ? (
        <QueryState error={combos.error} onRetry={() => combos.refetch()} />
      ) : failed.length ? (
        <>
          <ul className="mt-3 space-y-2 text-sm">
            {failed.map((combo) => (
              <li key={combo.id}>
                <Link to={`/combos/${combo.id}`} state={{ from: '/screenshots' }} className={LINK}>
                  {finishLabel(combo.glove)} with {finishLabel(combo.knife)}
                </Link>
                {combo.screenshot_state.reason && (
                  <span className="text-white/60"> · {REASONS[combo.screenshot_state.reason]}</span>
                )}
              </li>
            ))}
          </ul>
          <button type="button" className={`${SECONDARY} mt-3`} disabled={busy} onClick={() => void askAgain()}>
            Ask again for all failed
          </button>
        </>
      ) : (
        <p className="mt-2 text-sm text-white/60">No failed screenshots.</p>
      )}
    </section>
  )
}
