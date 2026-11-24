/** The Privacy Policy, as approved in spec 023. Changing the text needs a new entry in
 * `updated.json` (its test says so). */
import { bold, link, list, mail, p, type LegalDocument } from './document'
import { OPERATOR, runBy, type Operator } from './operator'
import { latest } from './updated'

/** Every host the site's pages load from or send data to, as the policy names them. A test
 * fails when the CSP allows a host that is not here, so a new host means a policy update. */
export const PRIVACY_HOSTS = [
  'combo.skin',
  'img.combo.skin',
  'view.combo.skin',
  'assets.combo.skin',
  'static.cloudflareinsights.com',
  'cloudflareinsights.com',
  'community.akamai.steamstatic.com',
]

const why = (...text: Parameters<typeof p>) => [bold('Why:'), ' ', ...text]
const basis = (...text: Parameters<typeof p>) => [bold('Legal basis:'), ' ', ...text]
const howLong = (...text: Parameters<typeof p>) => [bold('How long:'), ' ', ...text]

export function privacy(operator: Operator = OPERATOR): LegalDocument {
  const contact = mail(operator.email)
  const name = operator.name
  return {
    title: 'Privacy Policy',
    description: "What data Combo Skin's site touches, why, for how long, and your rights.",
    updated: latest('privacy').date,
    sections: [
      {
        id: 'in-short',
        heading: 'In short',
        blocks: [
          p(
            `${name} has no accounts, no forms, no ads and no cookies, and doesn't sell or share data for advertising. Like every website, the services that deliver it see your IP address when you visit. If you email us, we have what you send. This policy explains each of these: what, why, on what legal basis and for how long.`,
          ),
        ],
      },
      {
        id: 'controller',
        heading: 'Who is responsible',
        blocks: [
          p(`The controller of your personal data is ${name}, ${runBy(operator)}. Contact: `, contact, '.'),
          p("We don't have a data protection officer, as the law doesn't require one for a site like this."),
        ],
      },
      {
        id: 'visits',
        heading: 'When you visit the site',
        blocks: [
          p(
            `${name} is a set of static files served by Cloudflare from these addresses: combo.skin (the site), img.combo.skin (screenshots and pictures), view.combo.skin (the 3D viewer) and assets.combo.skin (the 3D viewer's files). Like any web server, Cloudflare receives with each request your IP address, the date and time, the address asked for, what your browser reports about itself (its name, version and operating system), the address of the referring page (on our site, only its domain), and the approximate location that follows from your IP address.`,
          ),
          list(
            why('to deliver the pages you ask for, and to protect the site from attacks and abuse.'),
            basis('our legitimate interest in running a working, secure website (Article 6(1)(f) GDPR).'),
            howLong(
              "we keep no request logs ourselves. We see only totals in Cloudflare's dashboard, such as the number of requests per day and per country. Cloudflare says it keeps visitors' IP addresses only for a limited time, if at all (see ",
              link('Who receives data', '#recipients'),
              ').',
            ),
          ),
        ],
      },
      {
        id: 'statistics',
        heading: 'Visitor statistics',
        blocks: [
          p(
            "We use Cloudflare Web Analytics to see which pages are visited. It doesn't use cookies, doesn't store anything on your device, doesn't fingerprint your browser and doesn't follow you to other sites. When a page loads, its script sends Cloudflare the page's address, the referring page, page-load timings, and your browser, operating system and device type. Cloudflare uses your IP address only to tell the country and drops it at the data centre nearest you. Query strings in page addresses aren't recorded. We see only totals.",
          ),
          list(
            why('to learn which pages are useful and how fast the site is.'),
            basis('our legitimate interest in understanding how the site is used (Article 6(1)(f) GDPR).'),
            howLong('Cloudflare keeps the detailed records for 7 days; after that, only a sample remains for the longer-term charts.'),
          ),
        ],
      },
      {
        id: 'steam-pictures',
        heading: 'Pictures from Steam',
        blocks: [
          p(
            "We show our own copies of the game's item pictures. If one of ours fails to load, your browser loads that picture once from Steam's image server instead (community.akamai.steamstatic.com, run for Valve over Akamai's network). That server then receives your IP address, your browser's name and version and which picture was asked for, but not which of our pages you were on.",
          ),
          list(
            why('so the page still shows the item when our copy fails.'),
            basis('our legitimate interest in showing complete pages (Article 6(1)(f) GDPR).'),
            [
              bold('Who decides:'),
              ' Valve, as an independent controller, under its own ',
              link('privacy policy', 'https://store.steampowered.com/privacy_agreement/'),
              '. We receive nothing from it.',
            ],
          ),
        ],
      },
      {
        id: 'emails',
        heading: 'When you email us',
        blocks: [
          p(
            'If you write to bugs@, combos@, partners@ or ',
            contact,
            ', we receive your email address, your name if you include it, your message and anything you attach.',
          ),
          list(
            why(
              'to answer you, fix what you report, consider your combo, credit you if you ask, discuss working together, and handle requests about your data.',
            ),
            basis(
              'our legitimate interest in answering messages sent to us (Article 6(1)(f) GDPR); for partnership talks, steps you ask for before an agreement (Article 6(1)(b)); for requests about your data, our legal duty to answer them (Article 6(1)(c)).',
            ),
            howLong(
              'up to 12 months after our last message to each other. A name you asked us to credit stays for as long as the credited combo is on the site. If an email leads to an agreement, we keep what the law requires us to keep, such as for tax.',
            ),
            "Emailing us is up to you; nothing on the site needs it. Please don't send us sensitive information, or anyone else's personal data.",
          ),
          p('For each legitimate interest named here, you can ask us for the balancing of our interest against your rights.'),
        ],
      },
      {
        id: 'browser-storage',
        heading: 'What the site stores in your browser',
        blocks: [
          p(
            `No cookies. The site stores one thing, and only sometimes: if we've published a new version while your page was open and the page can't load a part of itself, it reloads once and notes that in your browser's session storage (a key starting with "combo-skin:"), so it can't reload in a loop. The note is deleted when you close the tab, and it never leaves your browser. The law allows this without asking, as it's strictly necessary for the page you asked for.`,
          ),
          p(
            "The 3D view inside combo.skin stores nothing in your browser. If you open the 3D viewer directly at view.combo.skin, it remembers the settings you choose there, such as lighting and the items you picked, in your browser's local storage, so they're there next time. That stays on your device; you can clear it in your browser's settings.",
          ),
          p(
            "Your browser also keeps its usual cache of the files it downloaded, such as pictures and the 3D view's files, so they load faster next time.",
          ),
        ],
      },
      {
        id: 'recipients',
        heading: 'Who receives data',
        blocks: [
          list(
            [
              bold('Cloudflare, Inc.'),
              ' delivers the site, the images and the 3D viewer, and runs Web Analytics, as our processor under its ',
              link('Data Processing Addendum', 'https://www.cloudflare.com/cloudflare-customer-dpa/'),
              ', which is part of our agreement with Cloudflare. Cloudflare has servers around the world, and a request is usually handled at the one nearest you. Cloudflare publishes the ',
              link('list of its own sub-processors', 'https://www.cloudflare.com/gdpr/subprocessors/'),
              '.',
            ],
            [
              bold('Cloudflare'),
              ' also receives the email you send to our combo.skin addresses and forwards it to our mailbox (Cloudflare Email Routing), as our processor.',
            ],
            [
              bold('Google'),
              " provides that mailbox (Gmail). For now it's a personal Gmail account, so Google handles the email in it under its own terms and ",
              link('privacy policy', 'https://policies.google.com/privacy'),
              `, not under a processing agreement with us. For accounts in the EEA, that's Google Ireland Limited. We'll move to a mailbox with a processing agreement before ${name} earns anything.`,
            ],
            [
              bold('Valve Corporation'),
              " receives your request when a picture loads from Steam's image server, as an independent controller (see ",
              link('Pictures from Steam', '#steam-pictures'),
              ').',
            ],
          ),
          p(
            "We don't sell personal data, don't share it for advertising and don't give it to anyone else, unless the law requires it.",
          ),
        ],
      },
      {
        id: 'outside-eea',
        heading: 'Data outside the European Economic Area',
        blocks: [
          p(
            'Cloudflare is based in the United States and may handle a request, or store our images, outside the EEA. It is certified under the EU-US Data Privacy Framework, which the European Commission has found to give adequate protection, and its Data Processing Addendum includes the European Commission\'s Standard Contractual Clauses as well, should the Framework lapse. You can ask us for a copy of these safeguards. Google may handle email in the mailbox outside the EEA, under its own terms and safeguards. Valve, also in the United States, handles the picture requests under its own policy.',
          ),
        ],
      },
      {
        id: 'rights',
        heading: 'Your rights',
        blocks: [
          p(
            "You have the right to ask us for access to your personal data and a copy of it, to correct it, to delete it, to restrict how we use it, and, where it applies, to receive it in a portable form. You can object at any time to processing based on our legitimate interests, and we'll stop unless we have compelling reasons. To use any of these rights, email ",
            contact,
            ". We'll answer within one month.",
          ),
          p(
            "We keep no request logs and can't tell who a visitor is from the statistics, so we usually can't find data about a visit. If you tell us the email address you wrote from, we can find your emails.",
          ),
          p(
            'You also have the right to complain to the Polish data protection authority: the President of the Personal Data Protection Office (Prezes Urzędu Ochrony Danych Osobowych, ',
            link('uodo.gov.pl', 'https://uodo.gov.pl/'),
            '), or to the authority in the EU country where you live or work.',
          ),
        ],
      },
      {
        id: 'automated-decisions',
        heading: 'No automated decisions',
        blocks: [p("We don't make decisions about anyone by automated means, and we don't profile visitors.")],
      },
      {
        id: 'children',
        heading: 'Children',
        blocks: [
          p(
            `${name} is meant for people aged 16 and over. If you're younger, please don't email us. If we learn we've received an email from someone under 16, we'll delete it.`,
          ),
        ],
      },
      {
        id: 'changes',
        heading: 'Changes to this policy',
        blocks: [
          p(
            "We'll update this policy before the site starts doing anything new with personal data, and change the date at the top. Earlier versions are available on request.",
          ),
        ],
      },
      { id: 'contact', heading: 'Contact', blocks: [p(contact)] },
    ],
  }
}

export const PRIVACY = privacy()
