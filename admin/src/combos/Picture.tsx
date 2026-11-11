import { useState } from 'react'
import { catalogPictureUrl } from '../api/pictures'

const SIZES = {
  sm: 'h-10 w-10',
  md: 'h-16 w-16',
  lg: 'h-28 w-28',
} as const

/** A catalog picture beside a visible name (so its alt text is empty): our copy (`url`) first, and
 * the game's (`fallback`) if ours fails to load. Anything off those hosts, or a picture whose
 * every source fails, leaves an empty box of the same size. */
export function Picture({
  url,
  fallback,
  size = 'md',
}: {
  url: string | null | undefined
  fallback?: string | null
  size?: keyof typeof SIZES
}) {
  const sources = [catalogPictureUrl(url), catalogPictureUrl(fallback)].filter(
    (source, i, all): source is string => source !== null && all.indexOf(source) === i,
  )
  const [failed, setFailed] = useState<string[]>([])
  const src = sources.find((source) => !failed.includes(source))
  if (!src) {
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
      onError={() => setFailed((before) => [...before, src])}
    />
  )
}
