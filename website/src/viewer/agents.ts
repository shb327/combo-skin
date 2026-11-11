/** The agents a visitor can choose in the 3D window: those the viewer has built that the
 * website's own list (generated from the catalog snapshot) names and pictures. The viewer decides
 * what can be drawn; the website never shows the viewer's text for agents. */
import catalog from '@/data/agents.json'

export interface AgentCatalogEntry {
  def_index: number
  name: string
  team: string
  /** The game's picture: the fallback for our copy. */
  image: string
  /** Our copy's key in the image bucket. */
  image_key: string
}

export interface AgentChoice {
  /** The definition index to send, or null for the viewer's default. */
  value: number | null
  label: string
  /** The website's entry, for the picture; absent for a default the website does not know. */
  agent?: AgentCatalogEntry
  group?: 'Counter-Terrorists' | 'Terrorists'
}

const AGENTS = catalog.agents as AgentCatalogEntry[]

/** The default first, then the other built agents in the website's order: Counter-Terrorists,
 * then Terrorists, each by name. */
export function agentChoices(built: ReadonlySet<number>, defaultAgent: number, agents = AGENTS): AgentChoice[] {
  const fallback = agents.find((agent) => agent.def_index === defaultAgent)
  const choices: AgentChoice[] = [
    { value: null, label: fallback ? `Default (${fallback.name})` : 'Default', agent: fallback },
  ]
  for (const agent of agents) {
    if (agent.def_index === defaultAgent || !built.has(agent.def_index)) continue
    choices.push({
      value: agent.def_index,
      label: agent.name,
      agent,
      group: agent.team === 'ct' ? 'Counter-Terrorists' : 'Terrorists',
    })
  }
  return choices
}

/** The website's entry for an agent, for the picker's button. */
export function agentEntry(defIndex: number): AgentCatalogEntry | undefined {
  return AGENTS.find((agent) => agent.def_index === defIndex)
}

function words(text: string): string[] {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
}

/** Each typed word must start a word of the name, in any order, ignoring case and accents (as
 * the dashboard's finish and agent search). Nothing typed matches everything. */
export function matchesAgent(query: string, label: string): boolean {
  const wanted = words(query)
  const have = words(label)
  return wanted.every((word) => have.some((candidate) => candidate.startsWith(word)))
}
