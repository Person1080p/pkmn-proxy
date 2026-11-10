import { cardImageUrl, findCardImage, imageSetId } from './sets';
import type { CardCategory, LookupScope } from './types';

const API = 'https://api.tcgdex.net/v2/en';
export const LOOKUP_PAGE_SIZE = 48;

export interface LookupHit {
  id: string;
  name: string;
  number: string;
  setId: string;
  /** Small preview image; some cards have none. */
  thumb: string | null;
}

interface CardBrief {
  id: string;
  localId: string;
  name: string;
  image?: string;
}

/** TCG Pocket (the mobile game) sets are the only ones with upper-case ids; they aren't printable cards. */
const isPocket = (id: string) => /^[A-Z]/.test(id);

function toHits(data: CardBrief[]): LookupHit[] {
  return data
    .filter((c) => !isPocket(c.id))
    .map((c) => ({
      id: c.id,
      name: c.name,
      number: c.localId,
      setId: c.id.endsWith(`-${c.localId}`) ? c.id.slice(0, -c.localId.length - 1) : c.id,
      thumb: c.image ? `${c.image}/low.webp` : null,
    }));
}

export async function searchCards(
  name: string,
  scope: LookupScope,
  page: number,
  signal: AbortSignal,
): Promise<{ hits: LookupHit[]; more: boolean }> {
  const params = new URLSearchParams({
    name,
    'sort:field': 'name',
    'sort:order': 'ASC',
    'pagination:page': String(page),
    'pagination:itemsPerPage': String(LOOKUP_PAGE_SIZE),
  });
  if (scope === 'standard') params.set('legal.standard', 'true');
  const res = await fetch(`${API}/cards?${params}`, { signal });
  if (!res.ok) throw new Error(`Card search failed (${res.status})`);
  const data = (await res.json()) as CardBrief[];
  return { hits: toHits(data), more: data.length === LOOKUP_PAGE_SIZE };
}

let setNames: Promise<Map<string, string>> | null = null;

/** Set id → display name, fetched once. */
export function loadSetNames(): Promise<Map<string, string>> {
  setNames ??= fetch(`${API}/sets`)
    .then((r) => (r.ok ? (r.json() as Promise<{ id: string; name: string }[]>) : []))
    .then((sets) => new Map(sets.map((s) => [s.id, s.name])))
    .catch(() => {
      setNames = null;
      return new Map<string, string>();
    });
  return setNames;
}

const setCodes = new Map<string, Promise<string | null>>();

/** The official set abbreviation (e.g. sv03 → OBF), which is what deck lists use. */
export function setCode(setId: string): Promise<string | null> {
  let p = setCodes.get(setId);
  if (!p) {
    p = fetch(`${API}/sets/${encodeURIComponent(setId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((s: { abbreviation?: { official?: string } } | null) => s?.abbreviation?.official ?? null)
      .catch(() => {
        setCodes.delete(setId);
        return null;
      });
    setCodes.set(setId, p);
  }
  return p;
}

/** Pokémon / Trainer / Energy, for grouping the exported deck list. Best effort. */
async function cardCategory(id: string): Promise<CardCategory | undefined> {
  try {
    const res = await fetch(`${API}/cards/${encodeURIComponent(id)}`);
    const category = res.ok ? ((await res.json()) as { category?: string }).category?.toLowerCase() : undefined;
    return category === 'pokemon' || category === 'trainer' || category === 'energy' ? category : undefined;
  } catch {
    return undefined;
  }
}

/** Thumbnail for hits the search API has no image for, taken from the print image host instead. */
export function fallbackThumb(hit: LookupHit): string {
  return cardImageUrl(imageSetId(hit.setId), hit.number, 'small');
}

export interface ResolvedCard {
  name: string;
  set: string;
  number: string;
  src: string;
  category?: CardCategory;
}

/**
 * Finds an image for a search hit that can actually be exported. The search API's own full-size
 * images can't be read reliably from another site, so the print image hosts are used instead.
 */
export async function resolveHit(hit: LookupHit): Promise<ResolvedCard | null> {
  const [code, category, src] = await Promise.all([
    setCode(hit.setId),
    cardCategory(hit.id),
    findCardImage([imageSetId(hit.setId)], hit.number),
  ]);
  if (!src) return null;
  return {
    name: hit.name,
    set: code ?? hit.setId.toUpperCase(),
    number: hit.number.replace(/^0+(?=\d)/, ''),
    src,
    category,
  };
}

async function exactName(name: string, standardOnly: boolean): Promise<LookupHit[]> {
  const params = new URLSearchParams({ name: `eq:${name}` });
  if (standardOnly) params.set('legal.standard', 'true');
  const res = await fetch(`${API}/cards?${params}`);
  if (!res.ok) throw new Error(`Card search failed (${res.status})`);
  const hits = toHits((await res.json()) as CardBrief[]);
  // Main expansions first, then the lowest collector number: that is normally the regular printing
  // rather than a secret rare or a special-collection reprint.
  const mainSet = (h: LookupHit) => (/^(me|sv|swsh|sm|xy|bw)\d/.test(h.setId) ? 0 : 1);
  const num = (h: LookupHit) => parseInt(h.number, 10) || 9999;
  return hits.sort((a, b) => mainSet(a) - mainSet(b) || num(a) - num(b));
}

async function lookupName(name: string): Promise<ResolvedCard | null> {
  // The name must match exactly, so try the spellings deck lists commonly flatten.
  const spellings = [...new Set([name, name.replace(/’/g, "'"), name.replace(/’/g, "'").replace(/Poke/g, 'Poké')])];
  for (const standardOnly of [true, false]) {
    for (const spelling of spellings) {
      const hits = await exactName(spelling, standardOnly);
      for (const hit of hits.slice(0, 4)) {
        const card = await resolveHit(hit);
        if (card) return card;
      }
    }
  }
  return null;
}

const byName = new Map<string, Promise<ResolvedCard | null>>();

/**
 * Finds a printable card from its name alone, preferring a Standard-legal printing. Used for deck
 * lists that give trainers and energy without a set and number.
 */
export function findCardByName(name: string): Promise<ResolvedCard | null> {
  let p = byName.get(name);
  if (!p) {
    p = lookupName(name).catch(() => null);
    byName.set(name, p);
    // Only successes are worth remembering; a miss may just have been a network error.
    void p.then((card) => card || byName.delete(name));
  }
  return p;
}
