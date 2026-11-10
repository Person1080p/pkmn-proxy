import { useEffect, useMemo, useRef } from 'react';
import { computeLayout, expandCards, guideSegments, paginate } from '../lib/layout';
import { effectiveBorder } from '../lib/face';
import type { Card, PreviewFit, Settings } from '../lib/types';
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
  onFit: (fit: PreviewFit) => void;
}

export function Preview({ cards, settings: s, failed, onImageError, onRemoveCopy, onZoom, onFit }: Props) {
  const scroller = useRef<HTMLDivElement>(null);
  const L = useMemo(() => computeLayout(s), [s]);
  const segments = useMemo(() => guideSegments(s, L), [s, L]);
  const pages = useMemo(() => {
    const p = paginate(expandCards(cards), L.perPage);
    return p.length ? p : [[]];
  }, [cards, L.perPage]);

  const k = PX_PER_MM * s.previewZoom;

  // In a fit mode the zoom follows the space available, so resizing the window or a side panel
  // (or changing the paper size) re-fits the sheet.
  const fit = s.previewFit;
  const zoomNow = useRef(s.previewZoom);
  zoomNow.current = s.previewZoom;
  useEffect(() => {
    const el = scroller.current;
    if (!el || fit === 'none') return;
    let frame = 0;
    const apply = () => {
      frame = 0;
      // Hidden (e.g. another tab is showing on a phone): nothing to fit to.
      if (!el.clientWidth || !el.clientHeight) return;
      const byWidth = (el.clientWidth - 48) / (s.pageWidth * PX_PER_MM);
      const byHeight = (el.clientHeight - 72) / (s.pageHeight * PX_PER_MM);
      const zoom = Math.max(0.1, Math.min(4, fit === 'width' ? byWidth : Math.min(byWidth, byHeight)));
      if (Math.abs(zoom - zoomNow.current) > 0.004) onZoom(zoom);
    };
    apply();
    const observer = new ResizeObserver(() => {
      if (!frame) frame = requestAnimationFrame(apply);
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [fit, s.pageWidth, s.pageHeight, onZoom]);

  return (
    <div className="preview pane-preview">
      <div className="preview-bar">
        <label className="zoom">
          <span>Zoom</span>
          <input
            type="range"
            min={0.1}
            max={3}
            step={0.05}
            value={s.previewZoom}
            onChange={(e) => {
              onFit('none');
              onZoom(+e.target.value);
            }}
          />
          <output>{Math.round(s.previewZoom * 100)}%</output>
        </label>
        <button
          type="button"
          aria-pressed={fit === 'width'}
          title="Keep the sheet as wide as the preview area"
          onClick={() => onFit(fit === 'width' ? 'none' : 'width')}
        >
          Fit width
        </button>
        <button
          type="button"
          aria-pressed={fit === 'page'}
          title="Keep the whole sheet in view"
          onClick={() => onFit(fit === 'page' ? 'none' : 'page')}
        >
          Fit page
        </button>
        <button
          type="button"
          onClick={() => {
            onFit('none');
            onZoom(1);
          }}
        >
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
