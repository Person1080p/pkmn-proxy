import type { Card, CardCategory } from './types';

/** Basic energy numbers in the SVE set, keyed by type letter. */
const ENERGY_NUMBER: Record<string, number> = { G: 1, R: 2, W: 3, L: 4, P: 5, F: 6, D: 7, M: 8 };
const ENERGY_WORD: Record<string, string> = {
  grass: 'G',
  fire: 'R',
  water: 'W',
  lightning: 'L',
  psychic: 'P',
  fighting: 'F',
  darkness: 'D',
  dark: 'D',
  metal: 'M',
};

export interface ParseResult {
  cards: Card[];
  /** Lines that name a card without a set and number; these need a lookup by name. */
  byName: { qty: number; name: string; category?: CardCategory }[];
  skipped: string[];
}

function basicEnergyType(name: string): string | null {
  if (!/energy/i.test(name)) return null;
  const sym = name.match(/\{([GRWLPFDM])\}/i);
  if (sym) return sym[1].toUpperCase();
  const word = name.toLowerCase().match(/\b(grass|fire|water|lightning|psychic|fighting|darkness|dark|metal)\b/);
  if (word && /basic/i.test(name)) return ENERGY_WORD[word[1]];
  return null;
}

const HEADER = /^(#+\s*)?(pok[eé]mon|trainers?|energy|total cards)\b\s*[:\-–(]|format decklist/i;
/** RK9 public decklist: "4 Dreepy (TWM-128_EN)", or "3 Boss's Orders (EN)" for trainers and energy. */
const RK9_LINE = /^(\d+)\s+(.+?)\s*\((?:(.+)-([A-Za-z0-9]+)_)?([A-Z]{2,5})\)$/;
/** RK9 text pasted with quantity, name and code on separate lines. */
const RK9_SPLIT = /^[ \t]*(\d+)[ \t]*\r?\n[ \t]*([^\n(]+?)[ \t]*\r?\n[ \t]*(\([^()\n]*\))[ \t]*$/gm;
const CARD_LINE = /^(\d+)x?\s+(.+?)\s+([A-Za-z0-9-]{2,7})\s+([A-Za-z]*\d+[A-Za-z]*)(?:\s+PH)?$/;
const BARE_LINE = /^(\d+)x?\s+(.+)$/;

/**
 * Parses the standard PTCG Live / PTCGO export format:
 *   Pokémon: 12
 *   4 Charizard ex OBF 125
 * and the RK9 public decklist format:
 *   4 Dreepy (TWM-128_EN)
 *   3 Boss's Orders (EN)
 */
export function parseDeck(text: string): ParseResult {
  const byKey = new Map<string, Card>();
  const skipped: string[] = [];
  const byName = new Map<string, { qty: number; category?: CardCategory }>();
  // Set by the Pokémon / Trainer / Energy headings of a PTCG Live export.
  let section: CardCategory | undefined;
  // An RK9 page lists the deck once per language; only the first language pasted is used.
  let rk9Language: string | null = null;

  const add = (qty: number, name: string, set: string, rawNumber: string, category = section) => {
    // "013" and "13" are the same card; keep one spelling so duplicates merge.
    const number = rawNumber.replace(/^0+(?=\d)/, '');
    const key = `${set.toUpperCase()}-${number.toUpperCase()}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.qty += qty;
      return;
    }
    byKey.set(key, {
      id: crypto.randomUUID(),
      name,
      qty,
      // Filled in by the importer once the image has been located.
      src: '',
      kind: 'deck',
      set: set.toUpperCase(),
      number,
      category: basicEnergyType(name) ? 'energy' : category,
    });
  };

  /** A card named without set information: basic energy is known, anything else is looked up. */
  const addNamed = (qty: number, rawName: string, category = section) => {
    const name = rawName.replace(/\s+-\s+ACE\s?SPEC$/i, '').trim();
    const type = basicEnergyType(name);
    if (type) add(qty, name, 'SVE', String(ENERGY_NUMBER[type]));
    else if (name) byName.set(name, { qty: (byName.get(name)?.qty ?? 0) + qty, category });
  };

  for (const raw of text.replace(RK9_SPLIT, '$1 $2 $3').split(/\r?\n/)) {
    const line = raw.replace(/^\s*\*\s*/, '').trim();
    const heading = line.match(HEADER)?.[2]?.toLowerCase();
    if (heading) section = heading.startsWith('pok') ? 'pokemon' : heading.startsWith('trainer') ? 'trainer' : heading === 'energy' ? 'energy' : undefined;
    if (!line || HEADER.test(line) || line.startsWith('#') || /^\d+$/.test(line)) continue;

    const rk9 = line.match(RK9_LINE);
    if (rk9) {
      const qty = parseInt(rk9[1], 10);
      rk9Language ??= rk9[5];
      if (rk9[5] !== rk9Language || qty <= 0) continue;
      // RK9 has no headings, but only Pokémon carry a set and number.
      if (rk9[3]) add(qty, rk9[2], rk9[3], rk9[4], 'pokemon');
      else addNamed(qty, rk9[2], /energy/i.test(rk9[2]) ? 'energy' : 'trainer');
      continue;
    }

    const m = line.match(CARD_LINE);
    if (m) {
      const qty = parseInt(m[1], 10);
      const name = m[2];
      let set = m[3];
      let number = m[4];
      // Older exports list basic energy under a generic "Energy" set.
      if (set.toUpperCase() === 'ENERGY') {
        const type = basicEnergyType(name);
        if (!type) {
          skipped.push(line);
          continue;
        }
        set = 'SVE';
        number = String(ENERGY_NUMBER[type]);
      }
      if (qty > 0) add(qty, name, set, number);
      continue;
    }

    // "8 Basic {G} Energy" or "4 Ultra Ball", with no set information.
    const bare = line.match(BARE_LINE);
    if (bare && parseInt(bare[1], 10) > 0) {
      addNamed(parseInt(bare[1], 10), bare[2]);
      continue;
    }
    skipped.push(line);
  }

  return { cards: [...byKey.values()], byName: [...byName].map(([name, v]) => ({ name, ...v })), skipped };
}

export const SAMPLE_DECK = `Pokémon: 4
2 Charmander MEW 4
1 Charmeleon MEW 5
2 Charizard ex OBF 125
1 Pidgeot ex OBF 164

Trainer: 3
2 Arven SVI 166
2 Rare Candy SVI 191
2 Ultra Ball SVI 196

Energy: 1
4 Basic {R} Energy SVE 2`;
