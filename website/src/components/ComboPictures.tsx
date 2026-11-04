import type { ComboItem, PublicCombo } from '@/api/client'
import { pictureUrl } from '@/api/images'
import { itemName } from './comboText'

/** The top of a combo card, where its screenshot goes. Until combo screenshots arrive with
 * spec 012, it shows the glove and the knife finish pictures from the catalog side by side;
 * that spec shows the combo's screenshot here when it has one. */
export function ComboPictures({ combo }: { combo: PublicCombo }) {
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
