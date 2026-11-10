import { useMemo, useRef } from 'react';
import { computeLayout, expandCards, guideSegments, paginate } from '../lib/layout';
import { effectiveBorder } from '../lib/face';
import type { Card, Settings } from '../lib/types';
import { CardFace } from './CardFace';

const PX_PER_MM = 96 / 25.4;

interface Props {
  cards: Card[];
  settings: Settings;
  failed: Set<string>;
  onImageError: (id: string) => void;
  /** Remove one copy of the card. */
  onRemoveCopy: (id: string) => void;
  onZoom: (zoom: number) => void;
}

export function Preview({ cards, settings: s, failed, onImageError, onRemoveCopy, onZoom }: Props) {
  const scroller = useRef<HTMLDivElement>(null);
  const L = useMemo(() => computeLayout(s), [s]);
  const segments = useMemo(() => guideSegments(s, L), [s, L]);
  const pages = useMemo(() => {
    const p = paginate(expandCards(cards), L.perPage);
    return p.length ? p : [[]];
  }, [cards, L.perPage]);

  const k = PX_PER_MM * s.previewZoom;

  const fitWidth = () => {
    const el = scroller.current;
    if (el) onZoom(Math.max(0.1, Math.min(4, (el.clientWidth - 48) / (s.pageWidth * PX_PER_MM))));
  };
  const fitPage = () => {
    const el = scroller.current;
    if (!el) return;
    const zw = (el.clientWidth - 48) / (s.pageWidth * PX_PER_MM);
    const zh = (el.clientHeight - 72) / (s.pageHeight * PX_PER_MM);
    onZoom(Math.max(0.1, Math.min(4, zw, zh)));
  };

  return (
    <div className="preview">
      <div className="preview-bar">
        <label className="zoom">
          <span>Zoom</span>
          <input
            type="range"
            min={0.1}
            max={3}
            step={0.05}
            value={s.previewZoom}
            onChange={(e) => onZoom(+e.target.value)}
          />
          <output>{Math.round(s.previewZoom * 100)}%</output>
        </label>
        <button type="button" onClick={fitWidth}>
          Fit width
        </button>
        <button type="button" onClick={fitPage}>
          Fit page
        </button>
        <button type="button" onClick={() => onZoom(1)}>
          100%
        </button>
        <span className="muted bar-hint">Double-click a card to remove it</span>
      </div>
      <div className="preview-scroll" ref={scroller}>
        {pages.map((page, p) => (
          <figure key={p} className="page-wrap">
            <div
              className="page"
              style={{ width: s.pageWidth * k, height: s.pageHeight * k, background: s.pageBackground }}
            >
              <svg viewBox={`0 0 ${s.pageWidth} ${s.pageHeight}`} className="guides" aria-hidden="true">
                {segments.map(([x1, y1, x2, y2], i) => (
                  <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={s.guideColor} strokeWidth={s.guideWidth} />
                ))}
              </svg>
              {L.slots.map((slot, i) => {
                const card = page[i];
                const box = { left: slot.x * k, top: slot.y * k, width: L.cw * k, height: L.ch * k };
                if (!card) return <div key={i} className="slot empty" style={box} />;
                if (failed.has(card.id)) {
                  return (
                    <div
                      key={i}
                      className="slot missing"
                      style={box}
                      title="Double-click to remove this copy"
                      onDoubleClick={() => onRemoveCopy(card.id)}
                    >
                      <span>{card.name}</span>
                      <small>image not found</small>
                    </div>
                  );
                }
                return (
                  <div
                    key={i}
                    className="slot filled"
                    style={{ ...box, background: s.cornerFill ? s.cornerFillColor : undefined }}
                    title={`${card.name} · double-click to remove this copy`}
                    onDoubleClick={() => onRemoveCopy(card.id)}
                  >
                    <CardFace
                      src={card.src}
                      alt={card.name}
                      border={effectiveBorder(card, s)}
                      borderColor={card.borderColor}
                      settings={s}
                      onError={() => onImageError(card.id)}
                    />
                  </div>
                );
              })}
            </div>
            <figcaption>
              Page {p + 1} of {pages.length}
            </figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}
