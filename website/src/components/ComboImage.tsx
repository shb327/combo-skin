import { useState } from 'react'
import type { ComboItem, PublicCombo } from '@/api/client'
import { pictureUrl, screenshotSources } from '@/api/images'
import { CatalogImage } from './CatalogImage'
import { itemName } from './comboText'

/** A combo's screenshot, or, without one or when it fails to load, the glove and the knife finish
 * pictures from the catalog side by side. `sizes` is the screenshot's width on the page. */
export function ComboImage({ combo, alt, sizes }: { combo: PublicCombo; alt: string; sizes: string }) {
  const [failed, setFailed] = useState(false)
  const sources = failed ? null : screenshotSources(combo.screenshot)
  if (sources) {
    return (
      <img
        src={sources.src}
        srcSet={sources.srcSet}
        sizes={sizes}
        width={sources.width}
        height={sources.height}
        alt={alt}
        className="w-full h-full object-cover select-none"
        draggable={false}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
      />
    )
  }
  return (
    <div className="w-full h-full grid grid-cols-2">
      <Picture item={combo.glove} />
      <Picture item={combo.knife} />
    </div>
  )
}

/** A catalog picture (our copy, then the game's), or an empty half when neither is on an image
 * host the site loads from. */
function Picture({ item }: { item: ComboItem }) {
  const src = pictureUrl(item.image_url)
  const fallback = pictureUrl(item.fallback_image_url)
  if (!src && !fallback) return <div />
  return (
    <CatalogImage
      key={item.image_url}
      src={src}
      fallback={fallback}
      alt={itemName(item)}
      className="w-full h-full object-contain p-4 select-none"
      draggable={false}
      loading="lazy"
    />
  )
}
