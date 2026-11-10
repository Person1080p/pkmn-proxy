import { deckSections } from '../lib/decklist';
import type { Card } from '../lib/types';

/** Hidden on screen; it is the only thing shown when the page is printed. */
export function DeckListPrint({ cards, title }: { cards: Card[]; title: string }) {
  const sections = deckSections(cards);
  const total = sections.reduce((n, s) => n + s.count, 0);
  return (
    <div className="print-only">
      <h1>{title}</h1>
      <p>Deck list · {total} cards</p>
      {sections.map((section) => (
        <section key={section.title}>
          <h2>
            {section.title} ({section.count})
          </h2>
          <table>
            <tbody>
              {section.cards.map((c) => (
                <tr key={c.id}>
                  <td className="q">{c.qty}</td>
                  <td>{c.name}</td>
                  <td className="s">{c.kind === 'deck' ? `${c.set ?? ''} ${c.number ?? ''}` : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
}
