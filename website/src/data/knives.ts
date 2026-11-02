import type { Finish } from './gloves'

export interface KnifeType {
  id: string
  name: string
  finishes: Finish[]
}

// Tier 3: Base finishes (13) - Available on ALL knives including newest (Kukri, Classic)
const baseFinishes: Finish[] = [
  { id: 'vanilla', name: 'Vanilla' },
  { id: 'blue-steel', name: 'Blue Steel' },
  { id: 'boreal-forest', name: 'Boreal Forest' },
  { id: 'case-hardened', name: 'Case Hardened' },
  { id: 'crimson-web', name: 'Crimson Web' },
  { id: 'fade', name: 'Fade' },
  { id: 'forest-ddpat', name: 'Forest DDPAT' },
  { id: 'night-stripe', name: 'Night Stripe' },
  { id: 'safari-mesh', name: 'Safari Mesh' },
  { id: 'scorched', name: 'Scorched' },
  { id: 'slaughter', name: 'Slaughter' },
  { id: 'stained', name: 'Stained' },
  { id: 'urban-masked', name: 'Urban Masked' },
]

// Tier 2: Additional finishes (+12 = 25 total) - For newer knives (Talon, Ursus, etc.)
const tier2Finishes: Finish[] = [
  ...baseFinishes,
  { id: 'damascus-steel', name: 'Damascus Steel' },
  { id: 'doppler-black-pearl', name: 'Doppler (Black Pearl)' },
  { id: 'doppler-phase-1', name: 'Doppler (Phase 1)' },
  { id: 'doppler-phase-2', name: 'Doppler (Phase 2)' },
  { id: 'doppler-phase-3', name: 'Doppler (Phase 3)' },
  { id: 'doppler-phase-4', name: 'Doppler (Phase 4)' },
  { id: 'doppler-ruby', name: 'Doppler (Ruby)' },
  { id: 'doppler-sapphire', name: 'Doppler (Sapphire)' },
  { id: 'marble-fade', name: 'Marble Fade' },
  { id: 'rust-coat', name: 'Rust Coat' },
  { id: 'tiger-tooth', name: 'Tiger Tooth' },
  { id: 'ultraviolet', name: 'Ultraviolet' },
]

// Tier 1: Full finishes (+10 = 35 total) - For original knives (Bayonet, Karambit, M9, etc.)
// Note: Tier 1 uses "night" instead of "night-stripe"
const tier1Finishes: Finish[] = [
  { id: 'vanilla', name: 'Vanilla' },
  { id: 'autotronic', name: 'Autotronic' },
  { id: 'black-laminate', name: 'Black Laminate' },
  { id: 'blue-steel', name: 'Blue Steel' },
  { id: 'boreal-forest', name: 'Boreal Forest' },
  { id: 'bright-water', name: 'Bright Water' },
  { id: 'case-hardened', name: 'Case Hardened' },
  { id: 'crimson-web', name: 'Crimson Web' },
  { id: 'damascus-steel', name: 'Damascus Steel' },
  { id: 'doppler-black-pearl', name: 'Doppler (Black Pearl)' },
  { id: 'doppler-phase-1', name: 'Doppler (Phase 1)' },
  { id: 'doppler-phase-2', name: 'Doppler (Phase 2)' },
  { id: 'doppler-phase-3', name: 'Doppler (Phase 3)' },
  { id: 'doppler-phase-4', name: 'Doppler (Phase 4)' },
  { id: 'doppler-ruby', name: 'Doppler (Ruby)' },
  { id: 'doppler-sapphire', name: 'Doppler (Sapphire)' },
  { id: 'fade', name: 'Fade' },
  { id: 'forest-ddpat', name: 'Forest DDPAT' },
  { id: 'freehand', name: 'Freehand' },
  { id: 'gamma-doppler-emerald', name: 'Gamma Doppler (Emerald)' },
  { id: 'gamma-doppler-phase-1', name: 'Gamma Doppler (Phase 1)' },
  { id: 'gamma-doppler-phase-2', name: 'Gamma Doppler (Phase 2)' },
  { id: 'gamma-doppler-phase-3', name: 'Gamma Doppler (Phase 3)' },
  { id: 'gamma-doppler-phase-4', name: 'Gamma Doppler (Phase 4)' },
  { id: 'lore', name: 'Lore' },
  { id: 'marble-fade', name: 'Marble Fade' },
  { id: 'night', name: 'Night' },
  { id: 'rust-coat', name: 'Rust Coat' },
  { id: 'safari-mesh', name: 'Safari Mesh' },
  { id: 'scorched', name: 'Scorched' },
  { id: 'slaughter', name: 'Slaughter' },
  { id: 'stained', name: 'Stained' },
  { id: 'tiger-tooth', name: 'Tiger Tooth' },
  { id: 'ultraviolet', name: 'Ultraviolet' },
  { id: 'urban-masked', name: 'Urban Masked' },
]

export const knifeTypes: KnifeType[] = [
  // Tier 1: Original knives (35 finishes)
  {
    id: 'bayonet',
    name: 'Bayonet',
    finishes: tier1Finishes,
  },
  {
    id: 'bowie',
    name: 'Bowie Knife',
    finishes: tier1Finishes,
  },
  {
    id: 'butterfly',
    name: 'Butterfly Knife',
    finishes: tier1Finishes,
  },
  {
    id: 'falchion',
    name: 'Falchion Knife',
    finishes: tier1Finishes,
  },
  {
    id: 'flip',
    name: 'Flip Knife',
    finishes: tier1Finishes,
  },
  {
    id: 'gut',
    name: 'Gut Knife',
    finishes: tier1Finishes,
  },
  {
    id: 'huntsman',
    name: 'Huntsman Knife',
    finishes: tier1Finishes,
  },
  {
    id: 'karambit',
    name: 'Karambit',
    finishes: tier1Finishes,
  },
  {
    id: 'm9-bayonet',
    name: 'M9 Bayonet',
    finishes: tier1Finishes,
  },
  {
    id: 'shadow-daggers',
    name: 'Shadow Daggers',
    finishes: tier1Finishes,
  },
  // Tier 2: Newer knives (25 finishes)
  {
    id: 'navaja',
    name: 'Navaja Knife',
    finishes: tier2Finishes,
  },
  {
    id: 'nomad',
    name: 'Nomad Knife',
    finishes: tier2Finishes,
  },
  {
    id: 'paracord',
    name: 'Paracord Knife',
    finishes: tier2Finishes,
  },
  {
    id: 'skeleton',
    name: 'Skeleton Knife',
    finishes: tier2Finishes,
  },
  {
    id: 'stiletto',
    name: 'Stiletto Knife',
    finishes: tier2Finishes,
  },
  {
    id: 'survival',
    name: 'Survival Knife',
    finishes: tier2Finishes,
  },
  {
    id: 'talon',
    name: 'Talon Knife',
    finishes: tier2Finishes,
  },
  {
    id: 'ursus',
    name: 'Ursus Knife',
    finishes: tier2Finishes,
  },
  // Tier 3: Newest knives (13 finishes) - use night-stripe
  {
    id: 'classic',
    name: 'Classic Knife',
    finishes: baseFinishes,
  },
  {
    id: 'kukri',
    name: 'Kukri Knife',
    finishes: baseFinishes,
  },
]

const getKnifeImageUrl = (knifeId: string, finishId: string): string => {
  const baseUrl = import.meta.env.VITE_ASSET_BASE_URL
  return `${baseUrl}/knives/${knifeId}/${finishId}.png`
}

export const getAllKnives = () => {
  return knifeTypes.flatMap((type) =>
    type.finishes.map((finish) => ({
      typeId: type.id,
      typeName: type.name,
      finishId: finish.id,
      finishName: finish.name,
      fullName: `${type.name} | ${finish.name}`,
      id: `${type.id}-${finish.id}`,
      image: getKnifeImageUrl(type.id, finish.id),
    }))
  )
}
