import { Link } from 'react-router'
import { useTitle } from '../components/useTitle'

const DIRECTIONS = [
  { to: '/gloves', label: 'By gloves', text: 'Start from a pair of gloves and find the knives that go with it.' },
  { to: '/knives', label: 'By knife', text: 'Start from a knife and find the gloves that go with it.' },
]

export function HomePage() {
  useTitle('Home')
  return (
    <section>
      <h1 className="text-2xl font-semibold">Combos</h1>
      <p className="mt-2 text-white/70">Choose where to start.</p>
      <ul className="mt-6 grid gap-4 sm:grid-cols-2">
        {DIRECTIONS.map((direction) => (
          <li key={direction.to}>
            <Link
              to={direction.to}
              className="block rounded-lg border border-white/10 p-5 hover:border-accent"
            >
              <span className="text-lg font-semibold text-accent">{direction.label}</span>
              <span className="mt-1 block text-sm text-white/70">{direction.text}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
