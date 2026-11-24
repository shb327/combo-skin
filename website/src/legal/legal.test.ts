/// <reference types="node" />
import { readFileSync } from 'node:fs'
import privacyText from './fixtures/privacy.txt?raw'
import termsText from './fixtures/terms.txt?raw'
import { LICENCES } from './credits'
import { isRoute, link, longDate, p, plainText, safeHref, type LegalDocument } from './document'
import { OPERATOR } from './operator'
import { PRIVACY, PRIVACY_HOSTS, privacy } from './privacy'
import { TERMS, terms } from './terms'
import { VERSIONS, type DocumentName, type Version } from './updated'

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

/** Why a document's versions don't match its text, or null when they do. */
async function versionProblem(doc: LegalDocument, versions: Version[]): Promise<string | null> {
  const dates = versions.map((version) => version.date)
  if (dates.some((date, i) => i > 0 && date <= dates[i - 1])) {
    return `${doc.title}: the dates in updated.json must go forward`
  }
  if ((await sha256(plainText(doc))) !== versions[versions.length - 1].sha256) {
    return `${doc.title} changed: add an entry with its new date and hash to src/legal/updated.json`
  }
  return null
}

/** The `https://` hosts the CSP of the site's `_headers` allows. */
function cspHosts(file: string): string[] {
  const csp = file.split('\n').find((line) => line.trim().startsWith('Content-Security-Policy:'))
  return [...new Set([...(csp ?? '').matchAll(/https:\/\/([a-z0-9.-]+)/g)].map((match) => match[1]))]
}

/** A licence block of THIRD_PARTY_NOTICES.md, by its section heading. */
function noticeBlock(heading: string): string {
  const section = notices.split(`## ${heading}\n`)[1]
  return /```text\n([\s\S]*?)```/.exec(section)![1]
}

// Outside the website, so read from disk: the CSP the publish command writes, and the notices.
const here = import.meta.url
const repoFile = (path: string) => readFileSync(new URL(`../../../${path}`, here), 'utf8')
const headers = repoFile('deploy/tests/golden/_headers')
const notices = repoFile('THIRD_PARTY_NOTICES.md')

const DOCUMENTS: Record<DocumentName, LegalDocument> = { terms: TERMS, privacy: PRIVACY }

describe('the texts', () => {
  it('are the approved wording of spec 023', () => {
    expect(plainText(TERMS)).toBe(termsText)
    expect(plainText(PRIVACY)).toBe(privacyText)
  })

  it('carry the Valve notice and link to Credits', () => {
    expect(plainText(TERMS)).toContain(
      'Combo Skin is a fan site. It is not affiliated with, endorsed by or sponsored by Valve Corporation.',
    )
    const ownership = TERMS.sections.find((section) => section.id === 'ownership')!
    expect(JSON.stringify(ownership.blocks)).toContain('"href":"/credits"')
  })

  it('name no person while the legal identity is unset, and the person once it is set', () => {
    for (const doc of [TERMS, PRIVACY]) {
      expect(plainText(doc)).toContain('run by one person in Poland')
      expect(plainText(doc)).toContain(OPERATOR.email)
    }
    const named = { ...OPERATOR, legalIdentity: { name: 'Test Person', address: '1 Test Street, Testville' } }
    for (const doc of [terms(named), privacy(named)]) {
      expect(plainText(doc)).toContain('run by Test Person, 1 Test Street, Testville, Poland')
      expect(plainText(doc)).not.toContain('one person')
    }
  })

  it('date the latest version, formatted the same everywhere', () => {
    expect(TERMS.updated).toBe(VERSIONS.terms.at(-1)!.date)
    expect(longDate('2026-11-24')).toBe('24 November 2026')
    expect(longDate('2027-01-05')).toBe('5 January 2027')
  })
})

describe('the versions in updated.json', () => {
  it.each(Object.keys(DOCUMENTS) as DocumentName[])('match the text of %s', async (name) => {
    expect(await versionProblem(DOCUMENTS[name], VERSIONS[name])).toBeNull()
  })

  it('catch a change to the text without a new date', async () => {
    const changed = { ...TERMS, sections: [...TERMS.sections, { id: 'x', heading: 'More', blocks: [p('A new rule.')] }] }
    expect(await versionProblem(changed, VERSIONS.terms)).toBe(
      'Terms of Usage changed: add an entry with its new date and hash to src/legal/updated.json',
    )
    const backwards = [...VERSIONS.terms, { date: '2020-01-01', sha256: VERSIONS.terms[0].sha256 }]
    expect(await versionProblem(TERMS, backwards)).toMatch(/must go forward/)
  })
})

describe('the hosts the Privacy Policy names', () => {
  it('cover every host the CSP allows', () => {
    const hosts = cspHosts(headers)
    expect(hosts.length).toBeGreaterThan(0)
    for (const host of hosts) expect(PRIVACY_HOSTS, `${host} is not in the Privacy Policy`).toContain(host)
  })

  it('catch a new host in the CSP', () => {
    const added = headers.replace("frame-src https://view.combo.skin", "frame-src https://view.combo.skin https://www.youtube.com")
    expect(cspHosts(added).filter((host) => !PRIVACY_HOSTS.includes(host))).toEqual(['www.youtube.com'])
  })
})

describe('links', () => {
  it('allow only site paths, anchors, email and https', () => {
    for (const href of ['/credits', '#emails', 'mailto:privacy@combo.skin', 'https://example.com/'])
      expect(safeHref(href)).toBe(href)
    for (const href of ['javascript:alert(1)', 'http://example.com', '//example.com', 'data:text/html,x'])
      expect(safeHref(href)).toBeNull()
  })

  it('route site pages but not files', () => {
    expect(isRoute('/credits')).toBe(true)
    expect(isRoute('/licences.txt')).toBe(false)
    expect(isRoute('https://example.com')).toBe(false)
  })

  it('in every document are safe', () => {
    const hrefs = JSON.stringify([TERMS, PRIVACY].map((doc) => doc.sections))
      .match(/"href":"[^"]*"/g)!
      .map((match) => match.slice(8, -1))
    for (const href of hrefs) expect(safeHref(href), href).toBe(href)
    expect(link('x', 'javascript:alert(1)')).toEqual({ text: 'x', href: 'javascript:alert(1)' })
  })
})

describe('the licence texts on Credits', () => {
  it('are the ones in THIRD_PARTY_NOTICES.md', () => {
    expect(LICENCES.csgoApi).toBe(noticeBlock('CSGO-API'))
    expect(LICENCES.montserrat).toBe(noticeBlock('Montserrat'))
  })
})
