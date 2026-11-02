import { Hero } from "../components/Hero.tsx"
import { FiAlertCircle, FiImage, FiUsers, FiMail } from 'react-icons/fi'
import karambit from '@/assets/karambit.svg'

const contactOptions = [
  {
    icon: FiAlertCircle,
    title: 'Report a Bug',
    description: 'Found something broken? Let us know.',
    email: 'bugs@combo.skin',
  },
  {
    icon: FiImage,
    title: 'Submit a Combo',
    description: 'Got a great combo? We\'d love to feature it.',
    email: 'combos@combo.skin',
  },
  {
    icon: FiUsers,
    title: 'Partnership',
    description: 'Want to work together? Let\'s talk.',
    email: 'partners@combo.skin',
  },
]

export function Home() {
  return (
    <>
      <Hero />
      <section className="px-4 md:px-16 lg:px-44 pt-16 md:pt-48 py-8 md:py-16">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-16">
          <div>
            <div className="flex items-center gap-2">
              <img src={karambit} alt="" className="h-5" />
              <h2 className="text-2xl font-semibold text-accent">About Us</h2>
            </div>
            <p className="text-4xl font-semibold text-white mt-4">The story behind <span className="text-accent font-bold border-r-4 border-accent bg-accent/10 px-2 py-1">combo.skin</span><br />and its mission</p>
          </div>

          <div className="space-y-4 text-white/80 leading-relaxed">
            <p>
              COMBO.SKIN is a passion project imagined, built, and maintained by a <span className="text-white font-semibold">single developer</span>{' '}
              in my spare time alongside my regular work. What started as a personal tool to find
              matching glove and knife combinations has grown into something I hope the CS2 community
              finds useful.
            </p>
            <p>
              As a solo project, growth depends on community support. I'm actively seeking partnerships
              with skin marketplaces and CS2 content creators to help expand the platform and bring
              more value to users.
            </p>
            <p>
              There's a long roadmap of features in the works: price integrations, live inspects,
              weapon combos, and plenty more I'm keeping under wraps for now. <span className="text-white font-semibold">Stay tuned.</span>
            </p>
          </div>
        </div>
      </section>

      <section className="px-4 md:px-16 lg:px-44 pt-16 md:pt-48 pb-16 md:pb-48">
        <div className="text-left md:text-center mb-8 md:mb-16">
          <h2 className="text-3xl md:text-5xl font-bold text-white">Have feedback?</h2>
          <p className="text-3xl md:text-5xl font-bold mt-2 md:mt-4"><span className="text-accent font-bold border-r-4 border-accent bg-accent/10 px-2 py-1">Let's talk</span></p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-8">
          {contactOptions.map((option) => (
            <a
              key={option.title}
              href={`mailto:${option.email}`}
              className="group relative p-4 md:p-8 md:py-12 bg-white/5 rounded-lg overflow-hidden transition-colors"
            >
              <div className="absolute inset-0 bg-radial-[circle_at_center] from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
              <div className="flex items-center gap-2 mb-1 md:block md:mb-2">
                <option.icon className="w-5 h-5 md:w-8 md:h-8 text-zinc-400 md:mb-4" />
                <h3 className="text-base md:text-lg font-semibold text-white">{option.title}</h3>
              </div>
              <p className="text-white/60 text-sm mb-4 md:mb-36">{option.description}</p>
              <div className="flex items-center gap-2 text-sm text-zinc-400">
                <FiMail className="w-4 h-4" />
                <span>{option.email}</span>
              </div>
            </a>
          ))}
        </div>
      </section>
    </>
  )
}
