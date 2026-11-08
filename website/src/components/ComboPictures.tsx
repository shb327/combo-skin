import { useState } from 'react'
import type { ComboItem, PublicCombo } from '@/api/client'
import { pictureUrl, screenshotSources } from '@/api/images'
import { itemName } from './comboText'

/** Cards are one column below 1024 px and two above. */
const SIZES = '(min-width: 1024px) 50vw, 100vw'

/** The top of a combo card: its screenshot, or, without one or when it fails to load, the glove
 * and the knife finish pictures from the catalog side by side. */
export function ComboPictures({ combo }: { combo: PublicCombo }) {
  const [failed, setFailed] = useState(false)
  const sources = failed ? null : screenshotSources(combo.screenshot)
  if (sources) {
    return (
      <div className="w-full aspect-video bg-white/5">
        <img
          src={sources.src}
          srcSet={sources.srcSet}
          sizes={SIZES}
          width={sources.width}
          height={sources.height}
          alt={`${itemName(combo.glove)} with ${itemName(combo.knife)}`}
          className="w-full h-full object-cover select-none"
          draggable={false}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      </div>
    )
  }
  return (
    <div className="w-full aspect-video grid grid-cols-2 bg-white/5">
      <Picture item={combo.glove} />
      <Picture item={combo.knife} />
    </div>
  )
}

/** A catalog picture, or an empty half when it is not on the image host. */
function Picture({ item }: { item: ComboItem }) {
  const url = pictureUrl(item.image_url)
  if (!url) return <div />
  return (
    <img
      src={url}
      alt={itemName(item)}
      className="w-full h-full object-contain p-4 select-none"
      draggable={false}
      loading="lazy"
      referrerPolicy="no-referrer"
    />
  )
}
