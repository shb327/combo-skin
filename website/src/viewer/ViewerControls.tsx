/** The 3D window's controls row: the game's actions, each with its key, and the map and agent
 * choices. Each appears only when the viewer says it can do it (`features.ts`): an older viewer
 * gets "Inspect" alone. */
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Check, ChevronDown, Eye, Sword, Swords } from 'lucide-react'
import { pictureUrl } from '@/api/images'
import { agentChoices, agentEntry, matchesAgent, type AgentChoice } from './agents'
import type { Capabilities } from './features'
import type { Action } from './messages'
import type { Choice } from './params'

const ACTIONS: { action: Action; label: string; hint: string; key?: string; icon: ReactNode }[] = [
  { action: 'inspect', label: 'Inspect', hint: 'F', key: 'F', icon: <Eye aria-hidden className="w-4 h-4" /> },
  { action: 'light', label: 'Light swing', hint: 'Left click', icon: <Sword aria-hidden className="w-4 h-4" /> },
  { action: 'heavy', label: 'Heavy swing', hint: 'Right click', icon: <Swords aria-hidden className="w-4 h-4" /> },
]

const BUTTON =
  'flex items-center justify-center min-h-11 roomy:min-h-9 rounded-lg bg-white/10 text-white ' +
  'hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-white disabled:opacity-40 disabled:cursor-default ' +
  'cursor-pointer transition-colors'

/** Whether the window offers an action: inspect unless the knife lacks it; the swings only with
 * the viewer's `attack` feature, and only those built for the knife drawn. */
function offersAction(action: Action, capabilities: Capabilities | null, actions: Action[] | null): boolean {
  if (action !== 'inspect' && !capabilities?.features.has('attack')) return false
  return actions === null || actions.includes(action)
}

export function ViewerControls({
  capabilities,
  actions,
  enabled,
  hints,
  drawn,
  onPlay,
  onMap,
  onAgent,
  onAgentList,
}: {
  capabilities: Capabilities | null
  actions: Action[] | null
  /** False until the combo is drawn and while a change of map or agent loads. */
  enabled: boolean
  /** The keys and mouse buttons, hidden on touch-first devices. */
  hints: boolean
  /** The map and agent drawn. */
  drawn: Choice
  onPlay(action: Action): void
  onMap(map: string | null): void
  onAgent(agent: number | null): void
  /** The agent list opened or closed. */
  onAgentList(open: boolean): void
}) {
  const maps = capabilities?.maps ?? null
  const agents = capabilities?.agents ?? null
  return (
    <div className="flex flex-col short:flex-row roomy:flex-row roomy:flex-wrap roomy:items-center roomy:justify-between gap-2">
      <div className="flex gap-2">
        {ACTIONS.filter(({ action }) => offersAction(action, capabilities, actions)).map(
          ({ action, label, hint, key, icon }) => (
            <button
              key={action}
              type="button"
              aria-label={label}
              aria-keyshortcuts={key}
              title={hints ? `${label} (${hint})` : label}
              disabled={!enabled}
              onClick={() => onPlay(action)}
              className={`${BUTTON} flex-1 roomy:flex-none px-2 gap-1 text-xs whitespace-nowrap roomy:px-3 roomy:gap-1.5 roomy:text-sm`}
            >
              {icon}
              <span>{label}</span>
              {hints && (
                <kbd aria-hidden className="ml-1 px-1.5 rounded bg-black/40 text-white/60 text-xs font-sans">
                  {hint}
                </kbd>
              )}
            </button>
          ),
        )}
      </div>
      {(maps || agents) && (
        <div className="relative flex flex-1 min-w-0 roomy:flex-none gap-2">
          {maps && (
            <label className="flex shrink-0 items-center gap-2 text-sm text-white/60">
              <span>Map</span>
              <select
                aria-label="Map"
                value={drawn.map ?? capabilities!.defaultMap ?? maps[0].id}
                disabled={!enabled}
                onChange={(event) => onMap(event.target.value === capabilities!.defaultMap ? null : event.target.value)}
                className={`${BUTTON} px-3 gap-1.5 text-sm appearance-auto`}
              >
                {maps.map((map) => (
                  <option key={map.id} value={map.id} className="bg-background">
                    {map.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {agents && (
            <AgentPicker
              choices={agentChoices(agents, capabilities!.defaultAgent)}
              current={drawn.agent}
              defaultAgent={capabilities!.defaultAgent}
              enabled={enabled}
              focusSearch={hints}
              onChoose={onAgent}
              onOpenChange={onAgentList}
            />
          )}
        </div>
      )}
    </div>
  )
}

/** A button with the current agent opening a searchable list: the default first, then the
 * Counter-Terrorists and the Terrorists. Type words, move with Up and Down, choose with Enter or
 * a click; Escape closes the list (and not the window). Pictures load only while it is open. */
function AgentPicker({
  choices,
  current,
  defaultAgent,
  enabled,
  focusSearch,
  onChoose,
  onOpenChange,
}: {
  choices: AgentChoice[]
  current: number | null
  defaultAgent: number
  enabled: boolean
  /** Put the focus in the search box on opening; not on touch-first devices, where it would
   * bring up the on-screen keyboard over the list. */
  focusSearch: boolean
  onChoose(agent: number | null): void
  onOpenChange(open: boolean): void
}) {
  const id = useId()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(-1)
  const button = useRef<HTMLButtonElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const list = useRef<HTMLUListElement>(null)
  const shown = choices.filter((choice) => matchesAgent(query, choice.label))
  const entry = agentEntry(current ?? defaultAgent)
  const currentName = entry?.name ?? 'Default'

  useEffect(() => {
    if (open) (focusSearch ? input.current : list.current)?.focus()
  }, [open, focusSearch])

  const toggle = (next: boolean, refocus = false) => {
    setOpen(next)
    setQuery('')
    setActive(-1)
    onOpenChange(next)
    if (!next && refocus) button.current?.focus()
  }
  const choose = (choice: AgentChoice | undefined) => {
    if (!choice) return
    toggle(false, true)
    if (choice.value !== current) onChoose(choice.value)
  }
  const optionId = (i: number) => `${id}-option-${i}`

  // Consecutive choices of one group are listed under its name; the default has none.
  const runs: { group?: string; items: { choice: AgentChoice; index: number }[] }[] = []
  shown.forEach((choice, index) => {
    const last = runs[runs.length - 1]
    if (last && last.group === choice.group) last.items.push({ choice, index })
    else runs.push({ group: choice.group, items: [{ choice, index }] })
  })

  const option = (choice: AgentChoice, i: number) => {
    const url = pictureUrl(choice.agent?.image)
    return (
      <li
        key={choice.value ?? 'default'}
        id={optionId(i)}
        role="option"
        aria-selected={i === active}
        className={`flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm text-white ${i === active ? 'bg-white/15' : 'hover:bg-white/10'}`}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => choose(choice)}
      >
        {url ? (
          <img src={url} alt="" loading="lazy" referrerPolicy="no-referrer" className="w-8 h-8 object-contain" />
        ) : (
          <span className="w-8 h-8" />
        )}
        <span className="flex-1">{choice.label}</span>
        {choice.value === current && <Check aria-hidden className="w-4 h-4 text-white/60" />}
      </li>
    )
  }

  const picture = pictureUrl(entry?.image)
  return (
    <div
      className="flex-1 min-w-0 roomy:flex-none"
      onBlur={(event) => {
        if (open && !event.currentTarget.contains(event.relatedTarget as Node | null)) toggle(false)
      }}
    >
      <button
        ref={button}
        type="button"
        aria-label={`Agent: ${currentName}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={!enabled}
        onClick={() => toggle(!open)}
        className={`${BUTTON} px-3 gap-1.5 text-sm w-full min-w-0 roomy:w-auto roomy:max-w-64`}
      >
        <span className="shrink-0 text-white/60">Agent</span>
        {picture && <img src={picture} alt="" referrerPolicy="no-referrer" className="shrink-0 w-6 h-6 object-contain" />}
        <span className="min-w-0 truncate">{currentName}</span>
        <ChevronDown aria-hidden className="w-4 h-4 shrink-0" />
      </button>
      {open && (
        <div
          className="absolute bottom-full left-0 right-0 roomy:left-auto roomy:right-3 roomy:w-96 mb-2 roomy:mb-5 z-10 rounded-lg border border-white/15 bg-background shadow-xl"
          onKeyDown={(event) => {
            if (event.key !== 'Escape') return
            // The list takes Escape first: the window stays open.
            event.preventDefault()
            event.stopPropagation()
            toggle(false, true)
          }}
        >
          <input
            ref={input}
            type="text"
            role="combobox"
            aria-label="Search agents"
            aria-autocomplete="list"
            aria-expanded
            aria-controls={`${id}-list`}
            aria-activedescendant={active >= 0 && shown.length ? optionId(active) : undefined}
            autoComplete="off"
            placeholder="Search agents"
            value={query}
            className="w-full px-3 py-2 bg-transparent border-b border-white/15 text-white text-sm focus:outline-none"
            onChange={(event) => {
              setQuery(event.target.value)
              setActive(-1)
            }}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') {
                event.preventDefault()
                setActive((i) => Math.min(i + 1, Math.max(shown.length - 1, 0)))
              } else if (event.key === 'ArrowUp') {
                event.preventDefault()
                setActive((i) => Math.max(i - 1, 0))
              } else if (event.key === 'Enter') {
                event.preventDefault()
                if (active >= 0 || query.trim() !== '') choose(shown[Math.max(active, 0)])
              }
            }}
          />
          <ul
            ref={list}
            id={`${id}-list`}
            role="listbox"
            aria-label="Agents"
            tabIndex={-1}
            className="max-h-[50dvh] overflow-auto py-1 focus:outline-none"
          >
            {runs.map((run, r) =>
              run.group ? (
                <li key={`group-${r}`} role="group" aria-label={run.group}>
                  <div aria-hidden="true" className="px-3 pt-2 pb-1 text-xs font-semibold text-white/50">
                    {run.group}
                  </div>
                  <ul role="none">{run.items.map(({ choice, index }) => option(choice, index))}</ul>
                </li>
              ) : (
                run.items.map(({ choice, index }) => option(choice, index))
              ),
            )}
            {!shown.length && <li className="px-3 py-2 text-sm text-white/60">Nothing found.</li>}
          </ul>
        </div>
      )}
    </div>
  )
}
