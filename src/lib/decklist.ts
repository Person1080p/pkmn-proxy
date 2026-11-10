import type { Card, CardCategory } from './types';

export interface DeckSection {
  title: string;
  count: number;
  cards: Card[];
}

function categoryOf(card: Card): CardCategory | 'custom' | 'other' {
  if (card.kind === 'custom') return 'custom';
  if (card.category) return card.category;
  return /\benergy\b/i.test(card.name) ? 'energy' : 'other';
}

const ORDER: [ReturnType<typeof categoryOf>, string][] = [
  ['pokemon', 'Pokémon'],
  ['trainer', 'Trainer'],
  ['energy', 'Energy'],
  ['other', 'Other'],
  ['custom', 'Custom'],
];

export function deckSections(cards: Card[]): DeckSection[] {
  const listed = cards.filter((c) => c.qty > 0);
  return ORDER.map(([key, title]) => {
    const group = listed.filter((c) => categoryOf(c) === key);
    return { title, count: group.reduce((n, c) => n + c.qty, 0), cards: group };
  }).filter((s) => s.cards.length > 0);
}

export const deckLine = (c: Card) => [c.qty, c.name, c.kind === 'deck' ? c.set : '', c.kind === 'deck' ? c.number : '']
  .filter((part) => part !== '' && part !== undefined)
  .join(' ');

/** The list in PTCG Live export format, so it can be pasted back into this app or the game. */
export function deckListText(cards: Card[]): string {
  const sections = deckSections(cards);
  const total = sections.reduce((n, s) => n + s.count, 0);
  const blocks = sections.map((s) => [`${s.title}: ${s.count}`, ...s.cards.map(deckLine)].join('\n'));
  return [...blocks, `Total Cards: ${total}`].join('\n\n') + '\n';
}
