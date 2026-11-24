/** The Credits page (spec 023). The pattern guides come from `pattern-guides.json`, which the
 * API's `patterns export-website` writes from the groups' sources, so a new group's guide shows
 * here without a change to this file. */
import guidesFile from '@/data/pattern-guides.json'
import csgoApiLicence from './licences/csgo-api.txt?raw'
import montserratLicence from './licences/montserrat.txt?raw'
import { link, list, p, type Block, type LegalDocument, type Section } from './document'

export interface Guide {
  title: string
  author: string
  url: string
  groups: string[]
}

/** Names people asked to be credited with for a combo idea we featured (Terms, "Combo ideas
 * you send us"). The section is hidden while this is empty. */
export const COMBO_IDEAS_FROM: string[] = []

export const GUIDES: Guide[] = guidesFile.guides

export const LICENCES = { csgoApi: csgoApiLicence, montserrat: montserratLicence }

const licence = (summary: string, text: string): Block => ({ kind: 'licence', summary, text })

export function credits(guides: Guide[] = GUIDES, ideasFrom: string[] = COMBO_IDEAS_FROM): LegalDocument {
  const community: Section[] = ideasFrom.length
    ? [{ id: 'combo-ideas', heading: 'Combo ideas from the community', blocks: [list(...ideasFrom)] }]
    : []
  return {
    title: 'Credits',
    description: 'The pattern guides, item data, font and open-source code behind Combo Skin.',
    intro: [p('Combo Skin is built on the work of many people. Thank you.')],
    sections: [
      {
        id: 'pattern-guides',
        heading: 'Pattern guides',
        blocks: [
          p(
            'Our special patterns, such as Blue Gem or Fire & Ice, take their example seeds from these community guides:',
          ),
          list(
            ...guides.map((guide) => [
              link(guide.title, guide.url),
              ` by ${guide.author}. Used for: ${guide.groups.join(', ')}.`,
            ]),
          ),
        ],
      },
      ...community,
      {
        id: 'game',
        heading: 'The game',
        blocks: [
          p(
            'Counter-Strike 2, its item names, images and models belong to Valve Corporation. Combo Skin is a fan site, not affiliated with or endorsed by Valve.',
          ),
        ],
      },
      {
        id: 'item-data',
        heading: 'Item data',
        blocks: [
          p(
            'The list of knives, gloves and finishes comes from ',
            link('CSGO-API', 'https://github.com/ByMykel/CSGO-API'),
            ' by ByMykel, under the MIT licence.',
          ),
        ],
      },
      {
        id: '3d-viewer',
        heading: '3D viewer',
        blocks: [
          p(
            'Our 3D viewer started from the ',
            link('ChainSkins 3D Viewer', 'https://github.com/ChainSkins/cs2-3d-viewer'),
            ', under the MIT licence. Its asset pipeline uses ',
            link('ValveResourceFormat', 'https://github.com/ValveResourceFormat/ValveResourceFormat'),
            ', under the MIT licence.',
          ),
        ],
      },
      {
        id: 'font',
        heading: 'Font',
        blocks: [
          p(
            link('Montserrat', 'https://fontsource.org/fonts/montserrat'),
            ', by the Montserrat Project Authors, under the ',
            link('SIL Open Font License 1.1', 'https://openfontlicense.org/'),
            '.',
          ),
        ],
      },
      {
        id: 'open-source',
        heading: 'Open-source software',
        blocks: [
          p(
            'The site is built with open-source software, including React, React Router, TanStack Query, Swiper, Lucide and React Icons. ',
            link('Every package and its licence', '/licences.txt'),
            '.',
          ),
        ],
      },
      {
        id: 'licence-texts',
        heading: 'Licence texts',
        blocks: [
          licence('CSGO-API: MIT licence', csgoApiLicence),
          licence('Montserrat: SIL Open Font License 1.1', montserratLicence),
        ],
      },
    ],
  }
}

export const CREDITS = credits()
