import { loadImage } from './images';
import setmap from './setmap.json';

/**
 * Card images come from hosts that allow any site to read them (needed to draw cards into the PDF
 * and PNG exports). They are keyed by an internal set id ("sv3"), not the code printed in deck
 * lists ("OBF"), so codes are translated with a bundled table and, for sets newer than the table,
 * a lookup against the card database.
 */
const CODES: Record<string, string[]> = setmap.codes;
const TCGDEX_IDS: Record<string, string> = setmap.tcgdex;
const TCGDEX_API = 'https://api.tcgdex.net/v2/en';

/** The image set id for a card-database set id: "sv03" → "sv3", "me02.5" → "me2pt5". */
export function imageSetId(tcgdexId: string): string {
  return TCGDEX_IDS[tcgdexId] ?? tcgdexId.replace(/\.5$/, 'pt5').replace(/^([a-z]+)0+(\d)/, '$1$2');
}

/** Image ids use bare collector numbers: "013" is "13". */
const bareNumber = (number: string) => (/^\d+$/.test(number) ? String(parseInt(number, 10)) : number);

export function cardImageUrl(setId: string, number: string, size: 'large' | 'small' = 'large'): string {
  return `https://images.scrydex.com/pokemon/${setId}-${bareNumber(number)}/${size}`;
}

/** Second source, which covers a few cards the first lacks. */
const altImageUrl = (setId: string, number: string) =>
  `https://images.pokemontcg.io/${setId}/${bareNumber(number)}_hires.png`;

/**
 * Loads an image and confirms it is a real card. The main host answers unknown cards with a
 * 640 × 892 picture of a card back rather than an error (both hosts do this for a browser), which
 * must not be mistaken for a hit.
 */
async function isCardImage(url: string): Promise<boolean> {
  const img = await loadImage(url);
  return !!img && !(img.naturalWidth === 640 && img.naturalHeight === 892);
}

/** The first working image for a card, trying each candidate set id on each host. */
export async function findCardImage(setIds: string[], number: string): Promise<string | null> {
  for (const id of setIds) {
    for (const url of [cardImageUrl(id, number), altImageUrl(id, number)]) {
      if (await isCardImage(url)) return url;
    }
  }
  return null;
}

const lookedUp = new Map<string, Promise<string[]>>();

/** Candidate image set ids for a deck-list set code such as "OBF" or "PR-SV". */
function setIdsForCode(code: string): Promise<string[]> {
  const key = code.toUpperCase();
  if (CODES[key]) return Promise.resolve(CODES[key]);
  let p = lookedUp.get(key);
  if (!p) {
    // Not in the bundled table (a set released since): ask the card database which set uses this
    // abbreviation, and also try the code itself, which is the id for promo and energy sets.
    p = fetch(`${TCGDEX_API}/sets?${new URLSearchParams({ 'abbreviation.official': `eq:${key}` })}`)
      .then((r) => (r.ok ? (r.json() as Promise<{ id: string }[]>) : []))
      .catch(() => {
        lookedUp.delete(key);
        return [] as { id: string }[];
      })
      .then((sets) => [...new Set([...sets.map((s) => imageSetId(s.id)), key.toLowerCase()])]);
    lookedUp.set(key, p);
  }
  return p;
}

/** Finds the image for a card given as a deck-list set code and number, or null if there is none. */
export async function resolveCardImage(code: string, number: string): Promise<string | null> {
  return findCardImage(await setIdsForCode(code), number);
}

/**
 * Image source for a card that has no image. It must fail to load so the card shows as "image not
 * found"; a guessed URL on the image hosts would not, since they answer with a card back instead.
 */
export const MISSING_IMAGE = 'data:,missing';

/** Whether an image URL is on a host the exports can read. Older saved lists may not be. */
export function isReadableHost(src: string): boolean {
  return src.startsWith('data:') || src.startsWith('https://images.scrydex.com/') || src.startsWith('https://images.pokemontcg.io/');
}
