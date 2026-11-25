import { useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { isRoute, longDate, safeHref, type Block, type Inline, type LegalDocument } from '@/legal/document'

const LINK = 'text-accent underline underline-offset-2 hover:text-white focus-visible:text-white transition-colors'

function InlineView({ part }: { part: Inline }) {
  if (typeof part === 'string') return part
  if ('bold' in part) return <strong className="font-semibold text-white">{part.bold}</strong>
  const href = safeHref(part.href)
  if (!href) return part.text
  if (isRoute(href))
    return (
      <Link to={href} className={LINK}>
        {part.text}
      </Link>
    )
  return (
    <a href={href} className={LINK} rel={href.startsWith('https://') ? 'noreferrer' : undefined}>
      {part.text}
    </a>
  )
}

const Inlines = ({ content }: { content: Inline[] }) => content.map((part, i) => <InlineView key={i} part={part} />)

function BlockView({ block }: { block: Block }) {
  switch (block.kind) {
    case 'p':
      return (
        <p>
          <Inlines content={block.content} />
        </p>
      )
    case 'list':
      return (
        <ul className="list-disc pl-5 space-y-2">
          {block.items.map((item, i) => (
            <li key={i}>
              <Inlines content={item} />
            </li>
          ))}
        </ul>
      )
    case 'licence':
      return (
        <details className="rounded-lg bg-white/5 px-4 py-3">
          <summary className="cursor-pointer text-white">{block.summary}</summary>
          <pre className="mt-3 whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-white/70">
            {block.text.trim()}
          </pre>
        </details>
      )
  }
}

/** A Terms, Privacy or Credits document in the site's style: its heading, its date, an optional
 * list of contents, and its sections, each with an id so it can be linked. */
export function LegalDocumentView({ doc, contents = false }: { doc: LegalDocument; contents?: boolean }) {
  const { hash } = useLocation()

  // The sections exist only once the app has rendered, after the browser looked for the anchor.
  useEffect(() => {
    if (hash) document.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView?.()
  }, [hash])

  return (
    <article className="px-4 md:px-16 lg:px-44 pt-8 md:pt-16">
      <div className="max-w-[68ch] break-words text-white/80 leading-relaxed">
        <h1 className="text-3xl md:text-5xl font-bold text-white">{doc.title}</h1>
        {doc.updated && (
          <p className="mt-4 text-sm text-white/50">
            Last updated: <time dateTime={doc.updated}>{longDate(doc.updated)}</time>
          </p>
        )}
        {doc.intro && (
          <div className="mt-8 space-y-4">
            {doc.intro.map((block, i) => (
              <BlockView key={i} block={block} />
            ))}
          </div>
        )}
        {contents && (
          <nav aria-label="Contents" className="mt-8">
            <ul className="space-y-1 text-sm">
              {doc.sections.map((section) => (
                <li key={section.id}>
                  <a href={`#${section.id}`} className={LINK}>
                    {section.heading}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        )}
        {doc.sections.map((section) => (
          <section key={section.id} aria-labelledby={section.id}>
            <h2 id={section.id} className="mt-10 mb-4 scroll-mt-28 text-xl font-semibold text-white">
              {section.heading}
            </h2>
            <div className="space-y-4">
              {section.blocks.map((block, i) => (
                <BlockView key={i} block={block} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </article>
  )
}
