/** A legal or credits document as data: rendered by `LegalDocumentView`, hashed to keep its
 * "Last updated" date honest, and plain enough for a prerender to write as HTML. */

export type Inline = string | { bold: string } | { href: string; text: string }

export type Block =
  | { kind: 'p'; content: Inline[] }
  | { kind: 'list'; items: Inline[][] }
  | { kind: 'licence'; summary: string; text: string }

export interface Section {
  id: string
  heading: string
  blocks: Block[]
}

export interface LegalDocument {
  title: string
  description: string
  /** ISO date of the text's latest version; none for Credits. */
  updated?: string
  intro?: Block[]
  sections: Section[]
}

export const p = (...content: Inline[]): Block => ({ kind: 'p', content })
export const list = (...items: (Inline | Inline[])[]): Block => ({
  kind: 'list',
  items: items.map((item) => (Array.isArray(item) ? item : [item])),
})
export const bold = (text: string): Inline => ({ bold: text })
export const link = (text: string, href: string): Inline => ({ href, text })
export const mail = (address: string): Inline => link(address, `mailto:${address}`)

/** The only link targets a document may have: a site path, an anchor, an email or an https
 * page. Anything else (such as `javascript:`) is shown as plain text. */
const SAFE_HREF = /^(\/(?!\/)|#|mailto:|https:\/\/)/

export function safeHref(href: string): string | null {
  return SAFE_HREF.test(href) ? href : null
}

/** A path the app routes, as opposed to a file such as `/licences.txt`. */
export function isRoute(href: string): boolean {
  return href.startsWith('/') && !href.startsWith('//') && !/\.[a-z0-9]+$/i.test(href)
}

function inlineText(content: Inline[]): string {
  return content
    .map((part) => (typeof part === 'string' ? part : 'bold' in part ? part.bold : part.text))
    .join('')
}

function blockText(block: Block): string {
  switch (block.kind) {
    case 'p':
      return inlineText(block.content)
    case 'list':
      return block.items.map((item) => `- ${inlineText(item)}`).join('\n')
    case 'licence':
      return `${block.summary}\n${block.text.trim()}`
  }
}

/** The document's text without its date: what a reader reads, and what its hash covers. */
export function plainText(doc: LegalDocument): string {
  const parts = [doc.title, ...(doc.intro ?? []).map(blockText)]
  for (const section of doc.sections) parts.push(section.heading, ...section.blocks.map(blockText))
  return `${parts.join('\n\n')}\n`
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

/** "2026-11-24" as "24 November 2026", the same in every browser and locale. */
export function longDate(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number)
  return `${day} ${MONTHS[month - 1]} ${year}`
}
