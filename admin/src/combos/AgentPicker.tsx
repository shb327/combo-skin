import { SearchCombobox } from './SearchCombobox'
import { Picture } from './Picture'
import { TEAMS, useAgents, useScreenshotSettings, type Agent } from './queries'
import { SECONDARY } from './styles'
import { QueryState } from './ui'

/** A search entry: an agent's definition index, or null for "Default". */
interface AgentEntry {
  id: string
  label: string
  imageUrl: string
  group?: string
  value: number | null
}

/** The screenshot agent of a combo or a batch: the chosen agent with its picture, a search to
 * choose another, and "Use default". Null is the default agent, shown by name with a "Default"
 * tag. `known` names an agent the list may not hold, such as a retired one a combo keeps. */
export function AgentPicker({
  id,
  label,
  searchLabel = 'Find a screenshot agent',
  value,
  known = null,
  allowDefault = true,
  error,
  onChange,
}: {
  id: string
  label: string
  searchLabel?: string
  value: number | null
  known?: Agent | null
  allowDefault?: boolean
  /** A refusal from the API for this field. */
  error?: string
  onChange(value: number | null): void
}) {
  const agents = useAgents()
  const settings = useScreenshotSettings()
  const fallback = settings.data?.default_agent
  return (
    <fieldset className="mt-4 max-w-xl">
      <legend className="text-sm">{label}</legend>
      {agents.data && fallback ? (
        <>
          <Chosen value={value} agents={agents.data} known={known} fallback={fallback} />
          {allowDefault && value !== null && (
            <button type="button" className={`${SECONDARY} mt-2`} onClick={() => onChange(null)}>
              Use default
            </button>
          )}
          <div className="mt-2">
            <SearchCombobox<AgentEntry>
              label={searchLabel}
              inputId={id}
              placeholder="For example: ricksaw"
              openOnFocus
              error={error}
              entries={[
                ...(allowDefault
                  ? [{ id: 'default', label: `Default (${fallback.name})`, imageUrl: fallback.image_url, value: null }]
                  : []),
                ...agents.data.map((agent) => ({
                  id: String(agent.def_index),
                  label: agent.name,
                  imageUrl: agent.image_url,
                  group: TEAMS[agent.team],
                  value: agent.def_index,
                })),
              ]}
              onSelect={(entry) => onChange(entry.value)}
            />
          </div>
        </>
      ) : (
        <QueryState
          error={agents.error ?? settings.error}
          onRetry={() => {
            void agents.refetch()
            void settings.refetch()
          }}
        />
      )}
    </fieldset>
  )
}

function Chosen({
  value,
  agents,
  known,
  fallback,
}: {
  value: number | null
  agents: Agent[]
  known: Agent | null
  fallback: Agent
}) {
  const agent =
    value === null
      ? fallback
      : (agents.find((a) => a.def_index === value) ?? (known?.def_index === value ? known : null))
  return (
    <p className="mt-1 flex flex-wrap items-center gap-3">
      <Picture url={agent?.image_url} size="md" />
      <span className="font-semibold">{agent ? agent.name : `Agent ${value}`}</span>
      {value === null && <span className="rounded border border-white/30 px-2 py-0.5 text-xs">Default</span>}
      {agent && !agent.active && <span className="text-xs text-white/60">No longer in the game</span>}
    </p>
  )
}
