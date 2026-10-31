import {
  Archive,
  Armchair,
  Bathtub,
  Bed,
  Chair,
  CookingPot,
  Couch,
  Desk,
  Door,
  Fan,
  FrameCorners,
  Lamp,
  LampPendant,
  PaintRoller,
  PottedPlant,
  Rug,
  Shower,
  Table,
  Television,
  Toilet,
  type Icon,
} from '@phosphor-icons/react';

/** Icons a designer can pick. The key is what is saved on the hotspot. */
export const HOTSPOT_ICONS: { key: string; label: string; icon: Icon }[] = [
  { key: 'lamp', label: 'Lamp', icon: Lamp },
  { key: 'pendant', label: 'Pendant', icon: LampPendant },
  { key: 'sofa', label: 'Sofa', icon: Couch },
  { key: 'armchair', label: 'Armchair', icon: Armchair },
  { key: 'chair', label: 'Chair', icon: Chair },
  { key: 'bed', label: 'Bed', icon: Bed },
  { key: 'desk', label: 'Desk', icon: Desk },
  { key: 'table', label: 'Table', icon: Table },
  { key: 'tv', label: 'TV', icon: Television },
  { key: 'plant', label: 'Plant', icon: PottedPlant },
  { key: 'art', label: 'Art', icon: FrameCorners },
  { key: 'rug', label: 'Rug', icon: Rug },
  { key: 'bath', label: 'Bath', icon: Bathtub },
  { key: 'shower', label: 'Shower', icon: Shower },
  { key: 'toilet', label: 'Toilet', icon: Toilet },
  { key: 'door', label: 'Door', icon: Door },
  { key: 'kitchen', label: 'Kitchen', icon: CookingPot },
  { key: 'fan', label: 'Fan', icon: Fan },
  { key: 'storage', label: 'Storage', icon: Archive },
  { key: 'wall', label: 'Wall', icon: PaintRoller },
];

/** The key that forces a plain number on the pin. */
export const NUMBER_ICON = 'number';

const BY_KEY = new Map(HOTSPOT_ICONS.map((i) => [i.key, i.icon]));

/**
 * First match wins, so the specific words (pendant, armchair) come before the
 * general ones (light, chair).
 */
const RULES: [pattern: RegExp, key: string][] = [
  [/pendant|chandelier|hanging light/, 'pendant'],
  [/lamp|light|sconce|spot|led/, 'lamp'],
  [/sofa|couch|sectional|settee/, 'sofa'],
  [/armchair|lounge|accent chair|recliner/, 'armchair'],
  [/chair|stool|bench|seat/, 'chair'],
  [/bed|mattress|headboard/, 'bed'],
  [/desk|study|workstation/, 'desk'],
  [/table|counter|console|island/, 'table'],
  [/\btv\b|television|media|entertainment/, 'tv'],
  [/plant|planter|flower|greenery|vase/, 'plant'],
  [/art|paint(ing)?\b|frame|photo|poster|picture|mirror/, 'art'],
  [/rug|carpet|mat\b/, 'rug'],
  [/bath ?tub|bath\b/, 'bath'],
  [/shower/, 'shower'],
  [/toilet|wc|commode/, 'toilet'],
  [/door|entrance/, 'door'],
  [/kitchen|hob|stove|chimney/, 'kitchen'],
  [/fan\b|ceiling fan/, 'fan'],
  [/wardrobe|cabinet|storage|shelf|shelves|unit|drawer|closet/, 'storage'],
  [/wall|paint|colour|color|texture|wallpaper|panel/, 'wall'],
];

/**
 * Icon for a hotspot. A key the designer picked wins; "number" forces the
 * number; otherwise it is guessed from the label. Null means show the number.
 */
export function hotspotIcon(label: string, key?: string | null): Icon | null {
  if (key === NUMBER_ICON) return null;
  if (key && BY_KEY.has(key)) return BY_KEY.get(key) ?? null;
  const text = label.toLowerCase();
  const guess = RULES.find(([pattern]) => pattern.test(text))?.[1];
  return guess ? (BY_KEY.get(guess) ?? null) : null;
}
