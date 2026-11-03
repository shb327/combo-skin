import { Link } from 'react-router'
import { useTitle } from '../components/useTitle'

export function NotFoundPage() {
  useTitle('Not found')
  return (
    <section>
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <p className="mt-2 text-white/70">There is no page at this address.</p>
      <Link to="/" className="mt-4 inline-block text-accent underline">
        Go to Home
      </Link>
    </section>
  )
}
