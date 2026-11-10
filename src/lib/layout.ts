import type { Card, Settings } from './types';

export interface Layout {
  /** Printed card size in mm (after scale). */
  cw: number;
  ch: number;
  gridW: number;
  gridH: number;
  x0: number;
  y0: number;
  perPage: number;
  /** Top-left corner of each slot on a page, in mm. */
  slots: { x: number; y: number }[];
  fits: boolean;
}

export type Segment = [x1: number, y1: number, x2: number, y2: number];

export function computeLayout(s: Settings): Layout {
  const cw = (s.cardWidth * s.cardScale) / 100;
  const ch = (s.cardHeight * s.cardScale) / 100;
  const gridW = s.cols * cw + (s.cols - 1) * s.gapX;
  const gridH = s.rows * ch + (s.rows - 1) * s.gapY;
  const x0 = (s.pageWidth - gridW) / 2 + s.offsetX;
  const y0 = (s.pageHeight - gridH) / 2 + s.offsetY;
  const slots: { x: number; y: number }[] = [];
  for (let r = 0; r < s.rows; r++) {
    for (let c = 0; c < s.cols; c++) {
      slots.push({ x: x0 + c * (cw + s.gapX), y: y0 + r * (ch + s.gapY) });
    }
  }
  const eps = 0.01;
  const fits =
    x0 >= -eps && y0 >= -eps && x0 + gridW <= s.pageWidth + eps && y0 + gridH <= s.pageHeight + eps;
  return { cw, ch, gridW, gridH, x0, y0, perPage: s.cols * s.rows, slots, fits };
}

/** Largest grid that fits the page with the current card size and gaps. */
export function autoFitGrid(s: Settings, margin = 5): { cols: number; rows: number } {
  const cw = (s.cardWidth * s.cardScale) / 100;
  const ch = (s.cardHeight * s.cardScale) / 100;
  const fit = (page: number, card: number, gap: number) =>
    Math.max(1, Math.min(20, Math.floor((page - 2 * margin + gap + 0.01) / (card + gap))));
  return { cols: fit(s.pageWidth, cw, s.gapX), rows: fit(s.pageHeight, ch, s.gapY) };
}

const MARK_LENGTH = 5;
const MARK_STANDOFF = 1;

/** Cut guide line segments in mm. Drawn underneath the cards. */
export function guideSegments(s: Settings, L: Layout): Segment[] {
  if (s.guides === 'none') return [];
  const uniq = (vals: number[]) => [...new Set(vals.map((v) => Math.round(v * 1000) / 1000))];
  const xs = uniq(
    Array.from({ length: s.cols }, (_, c) => {
      const x = L.x0 + c * (L.cw + s.gapX);
      return [x, x + L.cw];
    }).flat(),
  );
  const ys = uniq(
    Array.from({ length: s.rows }, (_, r) => {
      const y = L.y0 + r * (L.ch + s.gapY);
      return [y, y + L.ch];
    }).flat(),
  );
  const segs: Segment[] = [];
  if (s.guides === 'lines') {
    for (const x of xs) segs.push([x, 0, x, s.pageHeight]);
    for (const y of ys) segs.push([0, y, s.pageWidth, y]);
    return segs;
  }
  const top = L.y0 - MARK_STANDOFF;
  const bottom = L.y0 + L.gridH + MARK_STANDOFF;
  const left = L.x0 - MARK_STANDOFF;
  const right = L.x0 + L.gridW + MARK_STANDOFF;
  for (const x of xs) {
    if (top > 0) segs.push([x, Math.max(0, top - MARK_LENGTH), x, top]);
    if (bottom < s.pageHeight) segs.push([x, bottom, x, Math.min(s.pageHeight, bottom + MARK_LENGTH)]);
  }
  for (const y of ys) {
    if (left > 0) segs.push([Math.max(0, left - MARK_LENGTH), y, left, y]);
    if (right < s.pageWidth) segs.push([right, y, Math.min(s.pageWidth, right + MARK_LENGTH), y]);
  }
  return segs;
}

/** One entry per physical card to print. */
export function expandCards(cards: Card[]): Card[] {
  return cards.flatMap((c) => Array.from({ length: Math.max(0, c.qty) }, () => c));
}

export function paginate<T>(items: T[], perPage: number): T[][] {
  const pages: T[][] = [];
  for (let i = 0; i < items.length; i += perPage) pages.push(items.slice(i, i + perPage));
  return pages;
}
