import { describe, expect, it } from 'vitest'
import catalog from '@/data/agents.json'
import { agentChoices, matchesAgent, type AgentCatalogEntry } from './agents'

const all = catalog.agents as AgentCatalogEntry[]
const ricksaw = all.find((a) => a.def_index === 5404)!
const darryl = all.find((a) => a.def_index === 4613)!

describe('agentChoices', () => {
  it('starts with the default, then Counter-Terrorists and Terrorists, each by name', () => {
    const choices = agentChoices(new Set(all.map((a) => a.def_index)), 5404)
    expect(choices[0]).toMatchObject({ value: null, label: 'Default (Lt. Commander Ricksaw | NSWC SEAL)' })
    expect(choices[0].agent).toBe(ricksaw)
    expect(choices).toHaveLength(63)
    const rest = choices.slice(1)
    expect(rest.map((c) => c.value)).not.toContain(5404)
    const groups = rest.map((c) => c.group)
    expect(groups).toEqual([...Array(28).fill('Counter-Terrorists'), ...Array(34).fill('Terrorists')])
    for (const group of ['Counter-Terrorists', 'Terrorists']) {
      const names = rest.filter((c) => c.group === group).map((c) => c.label)
      // The catalog's order: by name, ignoring letter case.
      const byName = (a: string, b: string) => (a.toLowerCase() < b.toLowerCase() ? -1 : 1)
      expect(names).toEqual([...names].sort(byName))
    }
  })

  it('lists only agents both the viewer has built and the website knows', () => {
    const choices = agentChoices(new Set([5404, 4613, 99999]), 5404)
    expect(choices.map((c) => c.value)).toEqual([null, 4613])
    expect(choices[1].agent).toBe(darryl)
  })

  it('keeps the default first even when the viewer does not list it', () => {
    expect(agentChoices(new Set([4613]), 5404).map((c) => c.value)).toEqual([null, 4613])
  })
})

describe('matchesAgent', () => {
  it('finds an agent by the start of any word of its name, in any order', () => {
    expect(matchesAgent('darr blood', 'Bloody Darryl The Strapped | The Professionals')).toBe(true)
    expect(matchesAgent('profess', 'Bloody Darryl The Strapped | The Professionals')).toBe(true)
    expect(matchesAgent('arryl', 'Bloody Darryl The Strapped | The Professionals')).toBe(false)
    expect(matchesAgent('', 'Anything')).toBe(true)
  })
})
