import { useEffect, useRef, useState } from 'react';
import { fallbackThumb, loadSetNames, resolveHit, searchCards, type LookupHit, type ResolvedCard } from '../lib/lookup';
import type { LookupScope } from '../lib/types';

interface Props {
  scope: LookupScope;
  onScope: (scope: LookupScope) => void;
  onAdd: (card: ResolvedCard) => void;
}

const MIN_QUERY = 2;

function HitThumb({ hit }: { hit: LookupHit }) {
  const src = hit.thumb ?? fallbackThumb(hit);
  const [failed, setFailed] = useState(false);

  if (failed) return <span className="no-thumb">No preview</span>;
  return <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} />;
}

export function LookupPanel({ scope, onScope, onAdd }: Props) {
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<LookupHit[]>([]);
  const [page, setPage] = useState(1);
  const [more, setMore] = useState(false);
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [sets, setSets] = useState<Map<string, string>>(() => new Map());
  const [adding, setAdding] = useState<Set<string>>(() => new Set());
  const [added, setAdded] = useState<Record<string, number>>({});
  const [problem, setProblem] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const term = query.trim();
  const hitsFor = useRef('');

  useEffect(() => {
    void loadSetNames().then(setSets);
  }, []);

  // Debounced search; a new query, scope or page cancels the request in flight.
  useEffect(() => {
    const key = `${scope}|${term}`;
    if (term.length < MIN_QUERY) {
      hitsFor.current = '';
      setHits([]);
      setMore(false);
      setStatus('idle');
      return;
    }
    const fresh = hitsFor.current !== key;
    if (fresh && page !== 1) {
      // Scope changed from outside mid-pagination: restart from the first page.
      setPage(1);
      return;
    }
    const ctrl = new AbortController();
    setStatus('loading');
    const timer = setTimeout(
      async () => {
        try {
          const result = await searchCards(term, scope, fresh ? 1 : page, ctrl.signal);
          hitsFor.current = key;
          setHits((prev) => {
            if (fresh) return result.hits;
            const seen = new Set(prev.map((h) => h.id));
            return [...prev, ...result.hits.filter((h) => !seen.has(h.id))];
          });
          setMore(result.more);
          setStatus('done');
        } catch {
          if (!ctrl.signal.aborted) setStatus('error');
        }
      },
      fresh ? 300 : 0,
    );
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [term, scope, page, attempt]);

  const changeQuery = (q: string) => {
    setQuery(q);
    setPage(1);
  };
  const changeScope = (s: LookupScope) => {
    onScope(s);
    setPage(1);
  };

  const add = async (hit: LookupHit) => {
    if (adding.has(hit.id)) return;
    setProblem(null);
    setAdding((a) => new Set(a).add(hit.id));
    const card = await resolveHit(hit);
    setAdding((a) => {
      const next = new Set(a);
      next.delete(hit.id);
      return next;
    });
    if (!card) {
      setProblem(`No printable image is available for ${hit.name} (${sets.get(hit.setId) ?? hit.setId} ${hit.number}).`);
      return;
    }
    onAdd(card);
    setAdded((a) => ({ ...a, [hit.id]: (a[hit.id] ?? 0) + 1 }));
  };

  return (
    <>
      <div className="segmented" role="group" aria-label="Card pool">
        <button type="button" aria-pressed={scope === 'standard'} onClick={() => changeScope('standard')}>
          Standard
        </button>
        <button type="button" aria-pressed={scope === 'all'} onClick={() => changeScope('all')}>
          All cards
        </button>
      </div>
      <input
        type="text"
        value={query}
        onChange={(e) => changeQuery(e.target.value)}
        placeholder={scope === 'standard' ? 'Search Standard-legal cards by name' : 'Search every card by name'}
        aria-label="Card name"
      />
      {problem && <p className="warn">{problem}</p>}
      {status === 'error' && (
        <p className="warn">
          The card search couldn’t be reached.{' '}
          <button type="button" className="link" onClick={() => setAttempt((n) => n + 1)}>
            Try again
          </button>
        </p>
      )}
      {status === 'idle' && <p className="hint">Type at least {MIN_QUERY} letters, then click a card to add a copy.</p>}
      {status === 'loading' && hits.length === 0 && <p className="hint">Searching…</p>}
      {status === 'done' && hits.length === 0 && (
        <p className="hint">
          No {scope === 'standard' ? 'Standard-legal ' : ''}cards match “{term}”.
          {scope === 'standard' && (
            <>
              {' '}
              <button type="button" className="link" onClick={() => changeScope('all')}>
                Search all cards
              </button>
            </>
          )}
        </p>
      )}
      {hits.length > 0 && (
        <div className="lookup-results">
          <ul>
            {hits.map((hit) => {
              const setName = sets.get(hit.setId) ?? hit.setId;
              return (
                <li key={hit.id}>
                  <button
                    type="button"
                    className="hit"
                    disabled={adding.has(hit.id)}
                    title={`Add ${hit.name} · ${setName} ${hit.number}`}
                    onClick={() => add(hit)}
                  >
                    <HitThumb hit={hit} />
                    {added[hit.id] && <span className="badge">+{added[hit.id]}</span>}
                    <strong>{hit.name}</strong>
                    <small>
                      {setName} · {hit.number}
                    </small>
                  </button>
                </li>
              );
            })}
          </ul>
          {more && (
            <button type="button" disabled={status === 'loading'} onClick={() => setPage((p) => p + 1)}>
              {status === 'loading' ? 'Loading…' : 'Load more'}
            </button>
          )}
        </div>
      )}
    </>
  );
}
