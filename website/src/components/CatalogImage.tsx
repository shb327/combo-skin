import { useState, type ImgHTMLAttributes } from 'react'

type CatalogImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'onError' | 'referrerPolicy'> & {
  /** Our copy, in our image bucket. */
  src: string | null
  /** The game's picture, shown if our copy fails to load. */
  fallback: string | null
}

/** A catalog picture: our copy first; if it fails to load, the game's picture, once; if that fails
 * too, the image is left as it is. No referrer is sent. Nothing is drawn without either URL. */
export function CatalogImage({ src, fallback, alt = '', ...props }: CatalogImageProps) {
  const [fellBack, setFellBack] = useState(false)
  const shown = fellBack ? fallback : (src ?? fallback)
  if (!shown) return null
  return (
    <img
      {...props}
      alt={alt}
      src={shown}
      referrerPolicy="no-referrer"
      onError={() => {
        if (!fellBack && src && fallback && fallback !== src) setFellBack(true)
      }}
    />
  )
}
