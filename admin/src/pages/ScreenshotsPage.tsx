import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router'
import { useApi } from '../api/useApi'
import { useTitle } from '../components/useTitle'
import { AgentPicker } from '../combos/AgentPicker'
import { comboErrorMessage } from '../combos/messages'
import { keys, useAgents, useScreenshotSettings, type Agent } from '../combos/queries'
import { LINK } from '../combos/styles'
import { ConfirmDialog } from '../combos/ui'

const usingDefault = (count: number) =>
  `${count} ${count === 1 ? 'combo uses' : 'combos use'} the default agent.`

/** The default screenshot agent, used by every combo without its own. */
export function ScreenshotsPage() {
  useTitle('Screenshots')
  const api = useApi()
  const queryClient = useQueryClient()
  const settings = useScreenshotSettings()
  const agents = useAgents()
  const [pending, setPending] = useState<Agent | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [failure, setFailure] = useState<string | null>(null)

  function choose(value: number | null) {
    setMessage(null)
    setFailure(null)
    const agent = agents.data?.find((a) => a.def_index === value)
    if (agent && agent.def_index !== settings.data?.default_agent.def_index) setPending(agent)
  }

  async function save(agent: Agent) {
    setBusy(true)
    try {
      const { data } = await api.request('put', '/admin/screenshot-settings', {
        body: { default_agent: agent.def_index },
      })
      queryClient.setQueryData(keys.screenshotSettings, data)
      setMessage('Saved the default agent.')
    } catch (error) {
      setFailure(comboErrorMessage(error))
    } finally {
      setBusy(false)
      setPending(null)
    }
  }

  return (
    <section>
      <p className="text-sm">
        <Link to="/" className={LINK}>
          Home
        </Link>
      </p>
      <h1 className="mt-1 text-2xl font-semibold">Screenshots</h1>
      <p className="mt-2 max-w-xl text-sm text-white/70">
        Screenshots show the knife and gloves on an agent&rsquo;s arms. A combo without its own screenshot agent
        uses the default agent.
      </p>
      {message && (
        <p role="status" className="mt-4 rounded-md bg-white/5 px-3 py-2 text-sm">
          {message}
        </p>
      )}
      {failure && (
        <p role="alert" className="mt-4 rounded-md bg-red-500/10 px-3 py-2 text-sm">
          {failure}
        </p>
      )}
      <AgentPicker
        id="default-agent"
        label="Default agent"
        searchLabel="Find an agent"
        value={settings.data?.default_agent.def_index ?? null}
        allowDefault={false}
        onChange={choose}
      />
      {settings.data && <p className="mt-2 text-sm text-white/70">{usingDefault(settings.data.using_default)}</p>}
      {pending && settings.data && (
        <ConfirmDialog
          title={`Make ${pending.name} the default agent?`}
          confirmLabel="Change default"
          busy={busy}
          onCancel={() => setPending(null)}
          onConfirm={() => void save(pending)}
        >
          {usingDefault(settings.data.using_default)}
        </ConfirmDialog>
      )}
    </section>
  )
}
