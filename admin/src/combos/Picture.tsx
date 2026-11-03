import { useState } from 'react'
import { pictureUrl } from '../api/images'

const SIZES = {
  sm: 'h-10 w-10',
  md: 'h-16 w-16',
  lg: 'h-28 w-28',
} as const

/** A catalog picture from the game's image host, beside a visible name (so its alt text is
 * empty). Anything else, or a picture that fails to load, leaves an empty box of the same size. */
export function Picture({ url, size = 'md' }: { url: string | null | undefined; size?: keyof typeof SIZES }) {
  const src = pictureUrl(url)
  const [failed, setFailed] = useState<string | null>(null)
  if (!src || failed === src) {
    return <span aria-hidden="true" className={`${SIZES[size]} block shrink-0 rounded bg-white/5`} />
  }
  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      draggable={false}
      className={`${SIZES[size]} shrink-0 object-contain select-none`}
      onError={() => setFailed(src)}
    />
  )
}
