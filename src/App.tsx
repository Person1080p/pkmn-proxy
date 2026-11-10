import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { BorderDialog } from './components/BorderDialog';
import { CardsPanel } from './components/CardsPanel';
import { DeckListPrint } from './components/DeckListPrint';
import { CropDialog } from './components/CropDialog';
import { Preview } from './components/Preview';
import { Resizer } from './components/Resizer';
import { SettingsPanel } from './components/SettingsPanel';
import { parseDeck } from './lib/deck';
import { downloadText, exportPdf, exportPngZip, type ExportResult } from './lib/export';
import { effectiveBorder, measureThinBorder } from './lib/face';
import { loadImage, readImageFile } from './lib/images';
import { computeLayout } from './lib/layout';
import { findCardByName, type ResolvedCard } from './lib/lookup';
import { isReadableHost, MISSING_IMAGE, resolveCardImage } from './lib/sets';
import { loadCards, loadSettings, sanitizeSettings, saveCards, saveSettings, settingsToJson } from './lib/storage';
import type { Card, CropJob, CropState, Settings } from './lib/types';

type Notice = { kind: 'info' | 'error'; text: string };

export default function App() {
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [cards, setCards] = useState<Card[]>([]);
  const [cardsLoaded, setCardsLoaded] = useState(false);
  const [failed, setFailed] = useState<Set<string>>(() => new Set());
  const [cropQueue, setCropQueue] = useState<CropJob[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [borderCardId, setBorderCardId] = useState<string | null>(null);
  // On narrow screens only one of the three panes is shown at a time.
  const [tab, setTab] = useState<'cards' | 'preview' | 'settings'>('preview');
  const [notice, setNotice] = useState<Notice | null>(null);

  const update = useCallback((patch: Partial<Settings>) => setSettings((s) => ({ ...s, ...patch })), []);
  const setZoom = useCallback((previewZoom: number) => update({ previewZoom }), [update]);

  useEffect(() => saveSettings(settings), [settings]);

  useEffect(() => {
    let live = true;
    loadCards().then((stored) => {
      if (!live) return;
      // Anything added before the stored list arrived goes after it.
      setCards((current) => [...stored, ...current]);
      setCardsLoaded(true);
      // Lists saved by earlier versions point at an image host that only works when the app runs
      // on localhost. Re-point those cards at a host that works everywhere.
      for (const card of stored) {
        if (card.kind !== 'deck' || !card.set || !card.number || isReadableHost(card.src)) continue;
        void resolveCardImage(card.set, card.number).then((src) => {
          if (!live || !src) return;
          setCards((cur) => cur.map((c) => (c.id === card.id && c.kind === 'deck' ? { ...c, src, autoBorder: undefined } : c)));
          setFailed((f) => {
            if (!f.has(card.id)) return f;
            const next = new Set(f);
            next.delete(card.id);
            return next;
          });
        });
      }
    });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (cardsLoaded) void saveCards(cards);
  }, [cards, cardsLoaded]);

  // Check each deck card's scan once for an unusually thin border; the result is stored on the card.
  const borderChecked = useRef(new Set<string>());
  useEffect(() => {
    if (!cardsLoaded) return;
    // Keyed by image as well as card, so a card whose image is replaced gets measured again.
    const key = (c: Card) => `${c.id}|${c.src}`;
    const pending = cards.filter((c) => c.kind === 'deck' && c.autoBorder === undefined && !borderChecked.current.has(key(c)));
    for (const card of pending) {
      borderChecked.current.add(key(card));
      void loadImage(card.src).then((img) => {
        if (!img) return;
        let add = 0;
        try {
          add = measureThinBorder(img);
        } catch {
          // Pixels unreadable: leave the card as it is.
        }
        setCards((cur) => cur.map((c) => (c.id === card.id && c.src === card.src && c.kind === 'deck' ? { ...c, autoBorder: add } : c)));
      });
    }
  }, [cards, cardsLoaded]);

  const layout = useMemo(() => computeLayout(settings), [settings]);
  const total = cards.reduce((n, c) => n + c.qty, 0);
  const pageCount = Math.ceil(total / layout.perPage);

  const clearFailed = (id: string) =>
    setFailed((f) => {
      if (!f.has(id)) return f;
      const next = new Set(f);
      next.delete(id);
      return next;
    });

  /** Adds cards to the list, bumping the quantity of any that are already there. */
  const mergeCards = (incoming: Card[]) =>
    setCards((current) => {
      const next = current.map((c) => ({ ...c }));
      for (const card of incoming) {
        const match = next.find((c) => c.kind === 'deck' && c.set === card.set && c.number === card.number);
        if (match) match.qty = Math.min(99, match.qty + card.qty);
        else next.push(card);
      }
      return next;
    });

  const importDeck = async (text: string, replace: boolean): Promise<string[]> => {
    const { cards: parsed, byName, skipped } = parseDeck(text);
    if (!parsed.length && !byName.length) {
      setNotice({
        kind: 'error',
        text: 'No cards found in that list. Lines should look like “4 Charizard ex OBF 125” or “4 Dreepy (TWM-128_EN)”.',
      });
      return skipped;
    }
    // Locate each card's image, a few at a time.
    let located = 0;
    for (let i = 0; i < parsed.length; i += 6) {
      setNotice({ kind: 'info', text: `Finding card images… ${located}/${parsed.length}` });
      await Promise.all(
        parsed.slice(i, i + 6).map(async (card) => {
          card.src = (await resolveCardImage(card.set!, card.number!)) ?? MISSING_IMAGE;
          located++;
        }),
      );
    }
    if (replace) {
      setCards([]);
      setFailed(new Set());
    }
    mergeCards(parsed);
    let count = parsed.reduce((n, c) => n + c.qty, 0);

    // Lines without a set and number (RK9 trainers and energy) are found by name, a few at a time.
    const notFound: string[] = [];
    for (let i = 0; i < byName.length; i += 4) {
      setNotice({ kind: 'info', text: `Looking up cards by name… ${i}/${byName.length}` });
      await Promise.all(
        byName.slice(i, i + 4).map(async ({ name, qty, category }) => {
          const found = await findCardByName(name);
          if (!found) {
            notFound.push(`${qty} ${name} (no card with this exact name was found)`);
            return;
          }
          mergeCards([{ id: crypto.randomUUID(), qty, kind: 'deck', ...found, category: found.category ?? category }]);
          count += qty;
        }),
      );
    }
    setNotice({ kind: 'info', text: `Imported ${count} card${count === 1 ? '' : 's'}.` });
    return [...skipped, ...notFound];
  };

  const addLookup = (found: ResolvedCard) => mergeCards([{ id: crypto.randomUUID(), qty: 1, kind: 'deck', ...found }]);

  const upload = async (files: File[], cardId?: string) => {
    const jobs: CropJob[] = [];
    let unreadable = 0;
    for (const file of files) {
      const original = await readImageFile(file);
      if (!original) {
        unreadable++;
        continue;
      }
      const target = cardId ? cards.find((c) => c.id === cardId) : undefined;
      jobs.push({
        key: crypto.randomUUID(),
        cardId,
        name: target?.name ?? file.name.replace(/\.[^.]+$/, ''),
        original,
      });
    }
    if (unreadable) setNotice({ kind: 'error', text: `${unreadable} file${unreadable > 1 ? 's' : ''} couldn’t be read as an image.` });
    if (jobs.length) setCropQueue((q) => [...q, ...jobs]);
  };

  const finishCrop = (job: CropJob, result: { name: string; src: string; crop: CropState }) => {
    if (job.cardId) {
      const id = job.cardId;
      setCards((current) =>
        current.map((c) => (c.id === id ? { ...c, ...result, kind: 'custom', original: job.original } : c)),
      );
      clearFailed(id);
    } else {
      setCards((current) => [
        ...current,
        { id: crypto.randomUUID(), qty: 1, kind: 'custom', original: job.original, ...result },
      ]);
    }
    setCropQueue((q) => q.slice(1));
  };

  const runExport = async (fn: (c: Card[], s: Settings, p: (m: string) => void) => Promise<ExportResult>) => {
    if (busy) return;
    setNotice(null);
    setBusy('Starting…');
    try {
      const { pages, missing } = await fn(cards, settings, setBusy);
      setNotice(
        missing.length
          ? {
              kind: 'error',
              text: `Exported ${pages} page${pages === 1 ? '' : 's'}, but ${missing.length} image${missing.length === 1 ? '' : 's'} couldn’t be loaded and printed as placeholders: ${[...new Set(missing)].slice(0, 6).join(', ')}${missing.length > 6 ? '…' : ''}`,
            }
          : { kind: 'info', text: `Exported ${pages} page${pages === 1 ? '' : 's'}.` },
      );
    } catch (err) {
      setNotice({ kind: 'error', text: `Export failed: ${err instanceof Error ? err.message : String(err)}` });
    } finally {
      setBusy(null);
    }
  };

  const importSettings = async (file: File) => {
    try {
      const parsed: unknown = JSON.parse(await file.text());
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object');
      setSettings(sanitizeSettings(parsed));
      setNotice({ kind: 'info', text: `Loaded settings from ${file.name}.` });
    } catch {
      setNotice({ kind: 'error', text: `${file.name} isn’t a valid settings file.` });
    }
  };

  const canExport = total > 0 && !busy;
  const job = cropQueue[0];
  const borderCard = cards.find((c) => c.id === borderCardId);

  return (
    <div className="app">
      <header className="topbar">
        <h1>Proxy Printer</h1>
        <span className="stats">
          {total} card{total === 1 ? '' : 's'} · {pageCount} page{pageCount === 1 ? '' : 's'} · {settings.cols} × {settings.rows}
        </span>
        <div className="spacer" />
        {busy && <span className="busy">{busy}</span>}
        <button type="button" className="primary" disabled={!canExport} onClick={() => runExport(exportPdf)}>
          Download PDF
        </button>
        <button type="button" disabled={!canExport} onClick={() => runExport(exportPngZip)}>
          Download PNGs (.zip)
        </button>
      </header>

      {notice && (
        <div className={`notice ${notice.kind}`} role="status">
          <span>{notice.text}</span>
          <button type="button" className="link" onClick={() => setNotice(null)}>
            Dismiss
          </button>
        </div>
      )}

      <nav className="tabs" aria-label="Sections">
        {(['cards', 'preview', 'settings'] as const).map((t) => (
          <button key={t} type="button" aria-pressed={tab === t} onClick={() => setTab(t)}>
            {t === 'cards' ? `Cards (${total})` : t === 'preview' ? 'Preview' : 'Settings'}
          </button>
        ))}
      </nav>

      <main
        className="layout"
        data-tab={tab}
        style={{ '--left': `${settings.leftPanelWidth}px`, '--right': `${settings.rightPanelWidth}px` } as CSSProperties}
      >
        <aside className="panel pane-cards">
          <CardsPanel
            cards={cards}
            failed={failed}
            lookupScope={settings.lookupScope}
            onLookupScope={(lookupScope) => update({ lookupScope })}
            onLookupAdd={addLookup}
            onImport={importDeck}
            onUpload={upload}
            onQty={(id, qty) => setCards((cur) => cur.map((c) => (c.id === id ? { ...c, qty } : c)))}
            onRemove={(id) => setCards((cur) => cur.filter((c) => c.id !== id))}
            onRecrop={(card) =>
              card.original &&
              setCropQueue((q) => [
                ...q,
                { key: crypto.randomUUID(), cardId: card.id, name: card.name, original: card.original!, crop: card.crop },
              ])
            }
            onBorder={(card) => setBorderCardId(card.id)}
            autoBorder={settings.autoBorder}
            fileName={settings.fileName}
            onClear={() => {
              setCards([]);
              setFailed(new Set());
            }}
          />
        </aside>
        <Resizer side="left" width={settings.leftPanelWidth} onWidth={(leftPanelWidth) => update({ leftPanelWidth })} />
        <Preview
          cards={cards}
          settings={settings}
          failed={failed}
          onImageError={(id) => setFailed((f) => (f.has(id) ? f : new Set(f).add(id)))}
          onRemoveCopy={(id) =>
            setCards((cur) => cur.flatMap((c) => (c.id !== id ? [c] : c.qty > 1 ? [{ ...c, qty: c.qty - 1 }] : [])))
          }
          onZoom={setZoom}
          onFit={(previewFit) => update({ previewFit })}
        />
        <Resizer side="right" width={settings.rightPanelWidth} onWidth={(rightPanelWidth) => update({ rightPanelWidth })} />
        <aside className="panel pane-settings">
          <SettingsPanel
            settings={settings}
            layout={layout}
            bordersAdjusted={cards.some((c) => effectiveBorder(c, settings) > 0)}
            update={update}
            onExportJson={() => downloadText(settingsToJson(settings), `${settings.fileName}-settings.json`)}
            onImportJson={importSettings}
          />
        </aside>
      </main>

      {borderCard && (
        <BorderDialog
          key={borderCard.id}
          card={borderCard}
          settings={settings}
          onClose={() => setBorderCardId(null)}
          onSave={(choice, allCards) => {
            setCards((cur) => cur.map((c) => (allCards || c.id === borderCard.id ? { ...c, ...choice } : c)));
            setBorderCardId(null);
          }}
        />
      )}

      <DeckListPrint cards={cards} title={settings.fileName} />

      {job && (
        <CropDialog
          key={job.key}
          job={job}
          remaining={cropQueue.length - 1}
          onDone={finishCrop}
          onSkip={() => setCropQueue((q) => q.slice(1))}
          onCancelAll={() => setCropQueue([])}
        />
      )}
    </div>
  );
}
