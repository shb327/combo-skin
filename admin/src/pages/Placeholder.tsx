import { useTitle } from '../components/useTitle'

export function Placeholder({ title, text }: { title: string; text: string }) {
  useTitle(title)
  return (
    <section>
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="mt-2 max-w-prose text-white/70">{text}</p>
      <p className="mt-4 text-sm text-white/50">This screen comes in a later version of the admin.</p>
    </section>
  )
}
