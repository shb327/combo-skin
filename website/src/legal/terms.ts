/** The Terms of Usage, as approved in spec 023. Changing the text needs a new entry in
 * `updated.json` (its test says so). */
import { link, list, mail, p, type LegalDocument } from './document'
import { OPERATOR, runBy, type Operator } from './operator'
import { latest } from './updated'

export function terms(operator: Operator = OPERATOR): LegalDocument {
  const contact = mail(operator.email)
  const name = operator.name
  return {
    title: 'Terms of Usage',
    description: 'The rules for using Combo Skin, a free fan site of CS2 knife and glove combos.',
    updated: latest('terms').date,
    sections: [
      {
        id: 'what-it-is',
        heading: `What ${name} is`,
        blocks: [
          p(
            `${name} (combo.skin) is a free website with ideas for pairing knife and glove skins in Counter-Strike 2. It shows each pairing as a screenshot and in a 3D view, with a rating, a short description and example patterns and floats. ${name} is ${runBy(operator)}.`,
          ),
          p(
            "These terms are the rules for using the site. By using it you agree to them. If you don't agree, please don't use the site.",
          ),
        ],
      },
      {
        id: 'services',
        heading: 'What you can do here',
        blocks: [
          list(
            "Browse knife and glove finishes and the combos we've put together.",
            'Look at a combo in 3D in your browser.',
            [
              'Email us: to report a bug (',
              mail('bugs@combo.skin'),
              '), to suggest a combo (',
              mail('combos@combo.skin'),
              '), about working together (',
              mail('partners@combo.skin'),
              '), or about privacy, these terms or a complaint (',
              contact,
              ').',
            ],
          ),
          p(
            'All of it is free. There are no accounts, nothing to sign up for and nothing to cancel: you start using the site when you open a page and stop when you leave.',
          ),
        ],
      },
      {
        id: 'requirements',
        heading: 'What you need',
        blocks: [
          p(
            'A recent version of a common browser (such as Chrome, Firefox, Safari or Edge) with JavaScript turned on, and an internet connection. The 3D view also needs WebGL 2 and downloads about 34 MB the first time you open it. To email us, you need an email account.',
          ),
        ],
      },
      {
        id: 'not-advice',
        heading: 'Not advice',
        blocks: [
          p(`Skins can be worth real money. Nothing on ${name} is investment, financial or trading advice.`),
          list(
            'Ratings and descriptions are our opinion of how a pairing looks.',
            'Patterns and floats are examples. "Blue Gem · 387" means one example pattern for that knife, not that every item with that number looks the same or is worth the same.',
            'Screenshots and the 3D view are our renders. A real item can look different in the game, in other light or at another wear.',
            "We don't show prices, and we don't say what any item is worth, will be worth, or where it's available.",
          ),
          p(
            'Before you buy, sell or trade, check the item yourself, for example by inspecting it in the game, and use a marketplace you trust. Decisions you make with what you find here are yours.',
          ),
        ],
      },
      {
        id: 'valve',
        heading: 'Valve',
        blocks: [
          p(
            `${name} is a fan site. It is not affiliated with, endorsed by or sponsored by Valve Corporation. Counter-Strike, Counter-Strike 2, Steam, and the names and images of in-game items belong to Valve Corporation. We use them only to show which items a combo is made of.`,
          ),
        ],
      },
      {
        id: 'stay-safe',
        heading: 'Stay safe',
        blocks: [
          p(
            `${name} will never ask for your Steam login, your password, a Steam Guard code or an API key, and never sends trade offers. Anyone who does, using our name, isn't us. Be careful with look-alike websites and links in messages.`,
          ),
        ],
      },
      {
        id: 'ownership',
        heading: 'Who owns what',
        blocks: [
          p(
            "The game's item names, images and models belong to Valve. Everything else on the site that we made is ours: the text, ratings, descriptions, the choice and arrangement of combos, and our screenshots and renders, as far as our own work goes. Some of what the site uses comes from others, and we credit it on our ",
            link('Credits', '/credits'),
            ' page.',
          ),
          p(
            `You're welcome to share links to ${name} and to share a screenshot of a page, for personal, non-commercial use, with a link back. Please don't copy the site's content or combo collection wholesale, or republish it as your own.`,
          ),
        ],
      },
      {
        id: 'fair-use',
        heading: 'Fair use of the site',
        blocks: [
          p("Please don't:"),
          list(
            'attack the site or the services it runs on, try to break in, or overload them;',
            'scrape or download the site in a way that slows it down for others, or to copy its collection; light automated access that follows our robots.txt is fine;',
            "use the site to break the law or anyone's rights;",
            "send us anything unlawful, such as malware, content that infringes someone's rights, or other people's personal data.",
          ),
          p(
            'If you find a security problem, tell us at ',
            mail('bugs@combo.skin'),
            ". We're grateful for reports and won't pursue anyone who reports in good faith and doesn't harm the site or its visitors.",
          ),
        ],
      },
      {
        id: 'other-websites',
        heading: 'Other websites',
        blocks: [
          p(
            "The site links to other websites, such as the pattern guides on our Credits page, and some pictures can load from Steam's image servers. We don't run those websites and aren't responsible for them. Their own terms and privacy policies apply.",
          ),
        ],
      },
      {
        id: 'combo-ideas',
        heading: 'Combo ideas you send us',
        blocks: [
          p(
            'You can suggest a combo at ',
            mail('combos@combo.skin'),
            '. A pairing of two skins is an idea, and ideas belong to no one: someone else may suggest the same pair, and we may already have it.',
          ),
          p(
            "If we feature your idea, we make our own screenshot and write our own text. We won't publish your pictures, your words or your email address without asking you first. By sending a combo, you agree that we may use the idea on the site and in posts about the site, free of charge.",
          ),
          p(
            "If you'd like credit, tell us the name to use, such as your Steam name, and we'll credit you on our Credits page when we feature your idea. You can ask us to change or remove that credit at any time. We don't promise to feature every idea or to reply to every email.",
          ),
        ],
      },
      {
        id: 'no-guarantees',
        heading: 'No guarantees',
        blocks: [
          p(
            `We offer ${name} for free, as it is. We work to keep it accurate and online, but we make mistakes, and we may change, remove or stop any part of the site at any time.`,
          ),
        ],
      },
      {
        id: 'liability',
        heading: 'Liability',
        blocks: [
          p(
            "We aren't liable for losses that come from decisions you make with what you find here, such as a trade, from the site being unavailable, or from other websites.",
          ),
          p(
            "None of this limits liability for harm we cause on purpose or through gross negligence, for death or personal injury, or any other liability the law doesn't let us limit. If you're a consumer, none of these terms takes away rights you have under the law of the country you live in.",
          ),
        ],
      },
      {
        id: 'complaints',
        heading: 'Complaints',
        blocks: [
          p(
            "If something on the site doesn't work as these terms describe, or you have a complaint, email ",
            contact,
            " with what happened and how we can reach you. We'll reply within 14 days.",
          ),
        ],
      },
      {
        id: 'changes',
        heading: 'Changes to these terms',
        blocks: [
          p(
            "We may change these terms, for example when we add a feature. The date at the top shows the latest version, and it applies from that date. When a change matters to you, we'll say so on the site for at least 30 days. If you don't agree with a new version, please stop using the site. We keep earlier versions: ask us for one.",
          ),
        ],
      },
      {
        id: 'law',
        heading: 'Law and courts',
        blocks: [
          p(
            `Polish law governs these terms. If you're a consumer living in another country, you keep the protection of the rules of that country that can't be set aside by agreement, and you can take a claim to the courts where you live. Otherwise, the courts of ${operator.country} decide disputes.`,
          ),
        ],
      },
      { id: 'contact', heading: 'Contact', blocks: [p(contact)] },
    ],
  }
}

export const TERMS = terms()
