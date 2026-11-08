import { useQueryClient } from '@tanstack/react-query'
import { useId, useState, type FormEvent } from 'react'
import { useApi } from '../api/useApi'
import { comboErrorMessage, isCode } from './messages'
import { keys, useWorkers, type Worker } from './queries'
import { INPUT, PRIMARY, SECONDARY } from './styles'
import { ConfirmDialog, QueryState } from './ui'

const when = (value: string | null) => (value ? new Date(value).toLocaleString() : 'Never')

/** Screenshot workers: create one (its token is shown once, kept in this component's state only,
 * and gone when the page is left), list them, revoke one after a confirmation. */
export function Workers() {
  const api = useApi()
  const queryClient = useQueryClient()
  const workers = useWorkers()
  const nameId = useId()
  const [name, setName] = useState('')
  const [created, setCreated] = useState<{ name: string; token: string } | null>(null)
  const [copied, setCopied] = useState(false)
  const [revoking, setRevoking] = useState<Worker | null>(null)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  async function create(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setFailure(null)
    setCreated(null)
    setCopied(false)
    try {
      const { data } = await api.request('post', '/admin/workers', { body: { name } })
      if (data) setCreated({ name: data.worker.name, token: data.token })
      setName('')
      await queryClient.invalidateQueries({ queryKey: keys.workers })
    } catch (error) {
      setFailure(isCode(error, 'worker_exists') ? 'A worker with this name already exists.' : comboErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  async function copy(token: string) {
    try {
      await navigator.clipboard.writeText(token)
      setCopied(true)
    } catch {
      setFailure('Could not copy. Select the token and copy it yourself.')
    }
  }

  async function revoke(worker: Worker) {
    setBusy(true)
    setFailure(null)
    try {
      await api.request('post', '/admin/workers/{worker_id}/revoke', { params: { path: { worker_id: worker.id } } })
      await queryClient.invalidateQueries({ queryKey: keys.workers })
    } catch (error) {
      setFailure(comboErrorMessage(error))
    } finally {
      setBusy(false)
      setRevoking(null)
    }
  }

  return (
    <section aria-label="Screenshot workers" className="mt-8">
      <h2 className="text-lg font-semibold">Screenshot workers</h2>
      <p className="mt-1 max-w-xl text-sm text-white/70">
        A worker draws screenshots in the 3D viewer and sends them to the API with its token. A revoked token stops
        working at once.
      </p>
      <form className="mt-3 flex flex-wrap items-end gap-2" onSubmit={(event) => void create(event)}>
        <div>
          <label htmlFor={nameId} className="block text-sm">
            Worker name
          </label>
          <input
            id={nameId}
            className={INPUT}
            value={name}
            maxLength={64}
            autoComplete="off"
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <button type="submit" className={PRIMARY} disabled={busy || !name.trim()}>
          Create worker
        </button>
      </form>
      {failure && (
        <p role="alert" className="mt-3 rounded-md bg-red-500/10 px-3 py-2 text-sm">
          {failure}
        </p>
      )}
      {created && (
        <div className="mt-3 max-w-xl rounded-lg border border-accent p-3">
          <label htmlFor={`${nameId}-token`} className="block text-sm">
            Token for {created.name}
          </label>
          <div className="mt-1 flex gap-2">
            <input
              id={`${nameId}-token`}
              className={`${INPUT} w-full font-mono`}
              value={created.token}
              readOnly
              autoComplete="off"
              spellCheck={false}
              onFocus={(event) => event.target.select()}
            />
            <button type="button" className={SECONDARY} onClick={() => void copy(created.token)}>
              Copy
            </button>
          </div>
          <p className="mt-2 text-sm text-white/70">Shown once: copy it to the worker now.</p>
          {copied && (
            <p role="status" className="mt-1 text-sm text-accent">
              Copied.
            </p>
          )}
        </div>
      )}
      {workers.data ? (
        workers.data.length ? (
          <table className="mt-4 w-full max-w-3xl text-left text-sm">
            <thead>
              <tr>
                <th className="pr-3 font-semibold">Name</th>
                <th className="pr-3 font-semibold">Created</th>
                <th className="pr-3 font-semibold">Last seen</th>
                <th className="pr-3 font-semibold">Revoked</th>
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {workers.data.map((worker) => (
                <tr key={worker.id} className="border-t border-white/10">
                  <td className="py-2 pr-3 break-all">{worker.name}</td>
                  <td className="py-2 pr-3">
                    {when(worker.created_at)} by {worker.created_by}
                  </td>
                  <td className="py-2 pr-3">{when(worker.last_seen_at)}</td>
                  <td className="py-2 pr-3">{worker.revoked_at ? when(worker.revoked_at) : 'No'}</td>
                  <td className="py-2">
                    {!worker.revoked_at && (
                      <button
                        type="button"
                        className={SECONDARY}
                        aria-label={`Revoke ${worker.name}`}
                        disabled={busy}
                        onClick={() => setRevoking(worker)}
                      >
                        Revoke
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="mt-4 text-sm text-white/60">No workers yet.</p>
        )
      ) : (
        <QueryState error={workers.error} onRetry={() => workers.refetch()} />
      )}
      {revoking && (
        <ConfirmDialog
          title={`Revoke ${revoking.name}?`}
          confirmLabel="Revoke"
          busy={busy}
          onCancel={() => setRevoking(null)}
          onConfirm={() => void revoke(revoking)}
        >
          Its token stops working at once. A revoked worker cannot be restored; create a new one instead.
        </ConfirmDialog>
      )}
    </section>
  )
}
