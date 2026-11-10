import { useRef, useState } from 'react';
import { SAMPLE_DECK } from '../lib/deck';
import { deckListText } from '../lib/decklist';
import { downloadText } from '../lib/export';
import type { ResolvedCard } from '../lib/lookup';
import type { Card, LookupScope } from '../lib/types';
import { LookupPanel } from './LookupPanel';
import { Section } from './fields';

interface Props {
  cards: Card[];
  failed: Set<string>;
  lookupScope: LookupScope;
  onLookupScope: (scope: LookupScope) => void;
  onLookupAdd: (card: ResolvedCard) => void;
  onImport: (text: string, replace: boolean) => Promise<string[]>;
  onUpload: (files: File[], cardId?: string) => void;
  onQty: (id: string, qty: number) => void;
  onRemove: (id: string) => void;
  onRecrop: (card: Card) => void;
  onBorder: (card: Card) => void;
  autoBorder: boolean;
  fileName: string;
  onClear: () => void;
}

export function CardsPanel({ cards, failed, lookupScope, onLookupScope, onLookupAdd, onImport, onUpload, onQty, onRemove, onRecrop, onBorder, autoBorder, fileName, onClear }: Props) {
  const [text, setText] = useState('');
  const [skipped, setSkipped] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [copied, setCopied] = useState<'yes' | 'failed' | null>(null);

  const copyDeckList = async () => {
    try {
      await navigator.clipboard.writeText(deckListText(cards));
      setCopied('yes');
    } catch {
      setCopied('failed');
    }
    setTimeout(() => setCopied(null), 2500);
  };
  const [dragging, setDragging] = useState(false);
  const addInput = useRef<HTMLInputElement>(null);
  const replaceInput = useRef<HTMLInputElement>(null);
  const replaceTarget = useRef<string | undefined>(undefined);

  const runImport = async (replace: boolean) => {
    setImporting(true);
    setSkipped([]);
    const bad = await onImport(text, replace).finally(() => setImporting(false));
    setSkipped(bad);
    if (!bad.length) setText('');
  };

  const images = (list: FileList | null | undefined) => [...(list ?? [])].filter((f) => f.type.startsWith('image/'));

  return (
    <>
      <Section title="Import deck list">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={8}
          spellCheck={false}
          placeholder={'Paste a PTCG Live export:\n2 Charizard ex OBF 125\n4 Basic {R} Energy SVE 2\n\nor an RK9 decklist:\n4 Dreepy (TWM-128_EN)\n3 Boss\'s Orders (EN)'}
        />
        <div className="row">
          <button type="button" className="primary" disabled={!text.trim() || importing} onClick={() => runImport(false)}>
            {importing ? 'Importing…' : 'Add to list'}
          </button>
          <button type="button" disabled={!text.trim() || !cards.length || importing} onClick={() => runImport(true)}>
            Replace list
          </button>
          <button type="button" onClick={() => setText(SAMPLE_DECK)}>
            Sample
          </button>
        </div>
        {skipped.length > 0 && (
          <div className="warn">
            Couldn’t import {skipped.length} line{skipped.length > 1 ? 's' : ''}:
            <ul>
              {skipped.slice(0, 5).map((l, i) => (
                <li key={i}>{l}</li>
              ))}
              {skipped.length > 5 && <li>…and {skipped.length - 5} more</li>}
            </ul>
          </div>
        )}
      </Section>

      <Section title="Look up cards">
        <LookupPanel scope={lookupScope} onScope={onLookupScope} onAdd={onLookupAdd} />
      </Section>

      <Section title="Custom cards">
        <button
          type="button"
          className={`dropzone${dragging ? ' over' : ''}`}
          onClick={() => addInput.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const files = images(e.dataTransfer.files);
            if (files.length) onUpload(files);
          }}
        >
          <strong>Upload images</strong>
          <span>Click or drop files here. Each one opens in the cropper.</span>
        </button>
        <input
          ref={addInput}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            const files = images(e.target.files);
            if (files.length) onUpload(files);
            e.target.value = '';
          }}
        />
        <input
          ref={replaceInput}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const files = images(e.target.files);
            if (files.length) onUpload(files.slice(0, 1), replaceTarget.current);
            e.target.value = '';
          }}
        />
      </Section>

      <Section title={`Cards (${cards.reduce((n, c) => n + c.qty, 0)})`}>
        {cards.length === 0 ? (
          <p className="hint">No cards yet. Import a deck list or upload an image to start.</p>
        ) : (
          <>
            <ul className="card-list">
              {cards.map((card) => {
                const bad = failed.has(card.id);
                return (
                  <li key={card.id} className={bad ? 'bad' : undefined}>
                    {bad ? <div className="thumb none">?</div> : <img className="thumb" src={card.src} alt="" loading="lazy" crossOrigin={card.src.startsWith('data:') ? undefined : 'anonymous'} />}
                    <div className="card-info">
                      <strong title={card.name}>{card.name}</strong>
                      <small>
                        {bad ? 'Image not found. Replace it with an upload.' : card.kind === 'custom' ? 'Custom' : `${card.set} ${card.number}`}
                        {!bad && autoBorder && card.border === undefined && (card.autoBorder ?? 0) > 0 && ' · thin border widened'}
                      </small>
                      <div className="card-actions">
                        {card.original && (
                          <button type="button" className="link" onClick={() => onRecrop(card)}>
                            Crop
                          </button>
                        )}
                        {!bad && (
                          <button type="button" className="link" onClick={() => onBorder(card)}>
                            Border{card.border !== undefined || card.borderColor ? ' ✓' : ''}
                          </button>
                        )}
                        <button
                          type="button"
                          className="link"
                          onClick={() => {
                            replaceTarget.current = card.id;
                            replaceInput.current?.click();
                          }}
                        >
                          Replace image
                        </button>
                        <button type="button" className="link danger" onClick={() => onRemove(card.id)}>
                          Remove
                        </button>
                      </div>
                    </div>
                    <div className="qty">
                      <button type="button" aria-label={`Fewer ${card.name}`} disabled={card.qty <= 1} onClick={() => onQty(card.id, card.qty - 1)}>
                        −
                      </button>
                      <span>{card.qty}</span>
                      <button type="button" aria-label={`More ${card.name}`} disabled={card.qty >= 99} onClick={() => onQty(card.id, card.qty + 1)}>
                        +
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
            <div className="decklist-actions">
              <span className="muted">Deck list</span>
              <div className="row">
                <button type="button" onClick={copyDeckList}>
                  {copied === 'yes' ? 'Copied' : 'Copy'}
                </button>
                <button type="button" onClick={() => downloadText(deckListText(cards), `${fileName}-decklist.txt`, 'text/plain')}>
                  Save .txt
                </button>
                <button type="button" onClick={() => window.print()}>
                  Print
                </button>
              </div>
              {copied === 'failed' && <p className="warn">The browser blocked clipboard access. Use “Save .txt” instead.</p>}
            </div>
            <div className="row">
              <button type="button" className="danger" onClick={() => window.confirm('Remove all cards from the list?') && onClear()}>
                Clear all
              </button>
            </div>
          </>
        )}
      </Section>
    </>
  );
}
