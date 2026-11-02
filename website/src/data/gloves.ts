export interface Finish {
  id: string
  name: string
}

export interface GloveType {
  id: string
  name: string
  finishes: Finish[]
}

export const gloveTypes: GloveType[] = [
  {
    id: 'bloodhound',
    name: 'Bloodhound Gloves',
    finishes: [
      { id: 'charred', name: 'Charred' },
      { id: 'bronzed', name: 'Bronzed' },
      { id: 'guerrilla', name: 'Guerrilla' },
      { id: 'snakebite', name: 'Snakebite' },
    ],
  },
  {
    id: 'driver',
    name: 'Driver Gloves',
    finishes: [
      { id: 'lunar-weave', name: 'Lunar Weave' },
      { id: 'diamondback', name: 'Diamondback' },
      { id: 'convoy', name: 'Convoy' },
      { id: 'crimson-weave', name: 'Crimson Weave' },
      { id: 'overtake', name: 'Overtake' },
      { id: 'racing-green', name: 'Racing Green' },
      { id: 'imperial-plaid', name: 'Imperial Plaid' },
      { id: 'black-tie', name: 'Black Tie' },
      { id: 'queen-jaguar', name: 'Queen Jaguar' },
      { id: 'snow-leopard', name: 'Snow Leopard' },
      { id: 'rezan-the-red', name: 'Rezan the Red' },
      { id: 'king-snake', name: 'King Snake' },
    ],
  },
  {
    id: 'hand-wraps',
    name: 'Hand Wraps',
    finishes: [
      { id: 'leather', name: 'Leather' },
      { id: 'spruce-ddpat', name: 'Spruce DDPAT' },
      { id: 'slaughter', name: 'Slaughter' },
      { id: 'badlands', name: 'Badlands' },
      { id: 'duct-tape', name: 'Duct Tape' },
      { id: 'arboreal', name: 'Arboreal' },
      { id: 'overprint', name: 'Overprint' },
      { id: 'cobalt-skulls', name: 'Cobalt Skulls' },
      { id: 'constrictor', name: 'Constrictor' },
      { id: 'caution', name: 'CAUTION!' },
      { id: 'desert-shamagh', name: 'Desert Shamagh' },
      { id: 'giraffe', name: 'Giraffe' },
    ],
  },
  {
    id: 'hydra',
    name: 'Hydra Gloves',
    finishes: [
      { id: 'case-hardened', name: 'Case Hardened' },
      { id: 'rattler', name: 'Rattler' },
      { id: 'mangrove', name: 'Mangrove' },
      { id: 'emerald', name: 'Emerald' },
    ],
  },
  {
    id: 'moto',
    name: 'Moto Gloves',
    finishes: [
      { id: 'spearmint', name: 'Spearmint' },
      { id: 'cool-mint', name: 'Cool Mint' },
      { id: 'turtle', name: 'Turtle' },
      { id: 'boom', name: 'Boom!' },
      { id: 'eclipse', name: 'Eclipse' },
      { id: 'polygon', name: 'Polygon' },
      { id: 'transport', name: 'Transport' },
      { id: 'pow', name: 'POW!' },
      { id: 'smoke-out', name: 'Smoke Out' },
      { id: 'blood-pressure', name: 'Blood Pressure' },
      { id: 'finish-line', name: 'Finish Line' },
      { id: '3rd-commando', name: '3rd Commando Company' },
    ],
  },
  {
    id: 'specialist',
    name: 'Specialist Gloves',
    finishes: [
      { id: 'crimson-kimono', name: 'Crimson Kimono' },
      { id: 'emerald-web', name: 'Emerald Web' },
      { id: 'foundation', name: 'Foundation' },
      { id: 'forest-ddpat', name: 'Forest DDPAT' },
      { id: 'fade', name: 'Fade' },
      { id: 'mogul', name: 'Mogul' },
      { id: 'buckshot', name: 'Buckshot' },
      { id: 'field-agent', name: 'Field Agent' },
      { id: 'marble-fade', name: 'Marble Fade' },
      { id: 'tiger-strike', name: 'Tiger Strike' },
      { id: 'lt-commander', name: 'Lt. Commander' },
      { id: 'crimson-web', name: 'Crimson Web' },
    ],
  },
  {
    id: 'sport',
    name: 'Sport Gloves',
    finishes: [
      { id: 'hedge-maze', name: 'Hedge Maze' },
      { id: 'pandoras-box', name: "Pandora's Box" },
      { id: 'superconductor', name: 'Superconductor' },
      { id: 'arid', name: 'Arid' },
      { id: 'bronze-morph', name: 'Bronze Morph' },
      { id: 'omega', name: 'Omega' },
      { id: 'amphibious', name: 'Amphibious' },
      { id: 'vice', name: 'Vice' },
      { id: 'slingshot', name: 'Slingshot' },
      { id: 'scarlet-shamagh', name: 'Scarlet Shamagh' },
      { id: 'nocts', name: 'Nocts' },
      { id: 'big-game', name: 'Big Game' },
    ],
  },
  {
    id: 'broken-fang',
    name: 'Broken Fang Gloves',
    finishes: [
      { id: 'jade', name: 'Jade' },
      { id: 'unhinged', name: 'Unhinged' },
      { id: 'needle-point', name: 'Needle Point' },
      { id: 'yellow-jacket', name: 'Yellow-banded' },
    ],
  },
]

const getGloveImageUrl = (gloveId: string, finishId: string): string => {
  const baseUrl = import.meta.env.VITE_ASSET_BASE_URL
  return `${baseUrl}/gloves/${gloveId}/${finishId}.png`
}

export const getAllGloves = () => {
  return gloveTypes.flatMap((type) =>
    type.finishes.map((finish) => ({
      typeId: type.id,
      typeName: type.name,
      finishId: finish.id,
      finishName: finish.name,
      fullName: `${type.name} | ${finish.name}`,
      id: `${type.id}-${finish.id}`,
      image: getGloveImageUrl(type.id, finish.id),
    }))
  )
}
