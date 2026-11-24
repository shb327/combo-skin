import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { GUIDES, credits } from '@/legal/credits'
import { link, p, type LegalDocument } from '@/legal/document'
import { VERSIONS } from '@/legal/updated'
import { renderSite } from '@/test/render'
import { LegalDocumentView } from './LegalDocumentView'

const heading = (name: string) => screen.getByRole('heading', { level: 1, name })
const footer = () => within(screen.getByRole('contentinfo'))

describe('the legal pages', () => {
  it.each([
    ['/terms', 'Terms of Usage'],
    ['/privacy', 'Privacy Policy'],
    ['/credits', 'Credits'],
  ])('%s shows its page between the app bar and the footer', (path, title) => {
    renderSite(path)
    expect(heading(title)).toBeInTheDocument()
    expect(screen.getByRole('main')).toContainElement(heading(title))
    expect(screen.getByRole('contentinfo')).toBeInTheDocument()
  })

  it.each([
    ['Terms of Usage', '/terms'],
    ['Privacy Policy', '/privacy'],
  ])('the footer link "%s" opens %s', (label, path) => {
    const site = renderSite('/')
    fireEvent.click(footer().getByRole('link', { name: label }))
    expect(site.url()).toBe(path)
    expect(heading(label)).toBeInTheDocument()
  })

  it.each([
    ['/terms', 'terms'],
    ['/privacy', 'privacy'],
  ] as const)('%s shows its "Last updated" date', (path, name) => {
    renderSite(path)
    const time = screen.getByText('24 November 2026')
    expect(time.tagName).toBe('TIME')
    expect(time).toHaveAttribute('datetime', VERSIONS[name].at(-1)!.date)
    expect(time.parentElement).toHaveTextContent('Last updated: 24 November 2026')
  })

  it('Credits has no date', () => {
    renderSite('/credits')
    expect(screen.queryByText(/Last updated/)).not.toBeInTheDocument()
  })

  it('Terms carries the Valve notice and links to Credits from "Who owns what"', () => {
    const site = renderSite('/terms')
    expect(
      screen.getByText(/Combo Skin is a fan site\. It is not affiliated with, endorsed by or sponsored by Valve Corporation\./),
    ).toBeInTheDocument()
    const ownership = screen.getByRole('heading', { name: 'Who owns what' }).closest('section')!
    fireEvent.click(within(ownership).getByRole('link', { name: 'Credits' }))
    expect(site.url()).toBe('/credits')
  })

  it('gives every section heading an id, and Privacy a contents list', () => {
    renderSite('/privacy')
    expect(screen.getByRole('heading', { name: 'When you email us' })).toHaveAttribute('id', 'emails')
    const contents = within(screen.getByRole('navigation', { name: 'Contents' }))
    expect(contents.getByRole('link', { name: 'When you email us' })).toHaveAttribute('href', '#emails')
  })

  it('opens email links as mailto and outside links without a referrer', () => {
    renderSite('/privacy')
    for (const element of screen.getAllByRole('link', { name: 'privacy@combo.skin' }))
      expect(element).toHaveAttribute('href', 'mailto:privacy@combo.skin')
    const uodo = screen.getByRole('link', { name: 'uodo.gov.pl' })
    expect(uodo).toHaveAttribute('href', 'https://uodo.gov.pl/')
    expect(uodo).toHaveAttribute('rel', 'noreferrer')
  })
})

describe('Credits', () => {
  it('lists every pattern guide with its author, link and groups', () => {
    renderSite('/credits')
    const section = screen.getByRole('heading', { name: 'Pattern guides' }).closest('section')!
    const items = within(section).getAllByRole('listitem')
    expect(items).toHaveLength(GUIDES.length)
    GUIDES.forEach((guide, i) => {
      const anchor = within(items[i]).getByRole('link', { name: guide.title })
      expect(anchor).toHaveAttribute('href', guide.url)
      expect(anchor).toHaveAttribute('rel', 'noreferrer')
      expect(items[i]).toHaveTextContent(`by ${guide.author}. Used for: ${guide.groups.join(', ')}.`)
    })
  })

  it('shows the game, item data, 3D viewer, font, open-source and licence sections', () => {
    renderSite('/credits')
    for (const name of ['The game', 'Item data', '3D viewer', 'Font', 'Open-source software', 'Licence texts'])
      expect(screen.getByRole('heading', { name })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'CSGO-API' })).toHaveAttribute('href', 'https://github.com/ByMykel/CSGO-API')
    expect(screen.getByRole('link', { name: 'ChainSkins 3D Viewer' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'ValveResourceFormat' })).toBeInTheDocument()
    const licences = screen.getByRole('link', { name: 'Every package and its licence' })
    expect(licences).toHaveAttribute('href', '/licences.txt')
    expect(screen.getByText('Montserrat: SIL Open Font License 1.1').closest('details')).toHaveTextContent(
      'SIL OPEN FONT LICENSE Version 1.1',
    )
  })

  it('hides "Combo ideas from the community" until someone is credited', () => {
    renderSite('/credits')
    expect(screen.queryByRole('heading', { name: 'Combo ideas from the community' })).not.toBeInTheDocument()
    render(
      <MemoryRouter>
        <LegalDocumentView doc={credits(GUIDES, ['SomePlayer'])} />
      </MemoryRouter>,
    )
    const section = screen.getByRole('heading', { name: 'Combo ideas from the community' }).closest('section')!
    expect(section).toHaveTextContent('SomePlayer')
  })
})

describe('a document link that is not safe', () => {
  it('is shown as text, not as a link', () => {
    const doc: LegalDocument = {
      title: 'Test',
      description: '',
      sections: [{ id: 'a', heading: 'A', blocks: [p('Go ', link('here', 'javascript:alert(1)'), '.')] }],
    }
    render(
      <MemoryRouter>
        <LegalDocumentView doc={doc} />
      </MemoryRouter>,
    )
    expect(screen.queryByRole('link', { name: 'here' })).not.toBeInTheDocument()
    expect(screen.getByText(/Go here\./)).toBeInTheDocument()
  })
})

describe('the footer', () => {
  it('names Combo Skin and Valve, and not Steam or another company', () => {
    renderSite('/')
    const text = screen.getByRole('contentinfo').textContent
    expect(text).toContain('© 2026 Combo Skin')
    expect(text).toContain('Not affiliated with Valve Corp.')
    expect(text).not.toContain('Powered by Steam')
    expect(text).not.toContain('CHOOSE')
    expect(footer().getAllByRole('link').map((element) => element.getAttribute('href'))).toEqual([
      '/',
      '/terms',
      '/privacy',
    ])
  })
})
