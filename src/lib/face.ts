import { loadImage } from './images';
import type { Card, Settings } from './types';

/** Border added to a card in mm when it has no override of its own: the thin-scan fix plus the global amount. */
export function defaultBorder(card: Card, s: Settings): number {
  return Math.max(0, s.addBorder + (s.autoBorder ? (card.autoBorder ?? 0) : 0));
}

/** Border added to this card in mm: its own override, or the default. */
export function effectiveBorder(card: Card, s: Settings): number {
  return Math.max(0, card.border ?? defaultBorder(card, s));
}

/** Border width of a current-era card, measured from recent scans. */
const MODERN_BORDER_MM = 2.5;
const CARD_WIDTH_MM = 63;

/**
 * Checks whether a scan's border is unusually thin next to a modern card and, if so, returns how
 * many mm of border to add to bring it in line; otherwise 0.
 *
 * The border is measured by walking in from each edge along 21 lines until the colour changes.
 * A card only qualifies when the evidence is unambiguous, because many modern designs have no
 * plain border at all (full arts) or a deliberately thin one (GX-style silver outlines):
 *  - at least three sides must each give a consistent width, and agree with one another;
 *  - that width must fall in the range seen on tightly cropped older scans (1.0–1.9 mm);
 *  - the border must be a warm colour, i.e. the yellow border older cards have.
 */
export function measureThinBorder(img: CanvasImageSource): number {
  const W = 504; // 8 px per mm
  const H = 704;
  const PX_PER_MM = 8;
  const THRESHOLD = 55;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, W, H);
  const data = ctx.getImageData(0, 0, W, H).data;
  const median = (v: number[]) => [...v].sort((a, b) => a - b)[v.length >> 1];

  const widths: number[] = [];
  const colours: number[][] = [];
  for (const side of ['L', 'R', 'T', 'B'] as const) {
    const along = side === 'L' || side === 'R' ? H : W;
    // Index of the pixel `depth` in from this side on scanline `p`.
    const at = (p: number, depth: number) => {
      const x = side === 'L' ? depth : side === 'R' ? W - 1 - depth : p;
      const y = side === 'T' ? depth : side === 'B' ? H - 1 - depth : p;
      return (y * W + x) * 4;
    };
    const depths: number[] = [];
    const refs: number[][] = [[], [], []];
    for (let n = 0; n < 21; n++) {
      const p = Math.floor(along * (0.2 + (0.6 * n) / 20));
      let start = 0;
      while (start < 40 && data[at(p, start) + 3] < 128) start++;
      const ref = [0, 1, 2].map((c) => (data[at(p, start + 2) + c] + data[at(p, start + 3) + c] + data[at(p, start + 4) + c]) / 3);
      const differs = (depth: number) => {
        const i = at(p, depth);
        return Math.hypot(data[i] - ref[0], data[i + 1] - ref[1], data[i + 2] - ref[2]) > THRESHOLD;
      };
      let found = 999;
      for (let k = start + 5; k < start + 80; k++) {
        if (differs(k) && differs(k + 1)) {
          found = k - start;
          break;
        }
      }
      depths.push(found);
      ref.forEach((v, c) => refs[c].push(v));
    }
    const mid = median(depths);
    const consistent = depths.filter((d) => Math.abs(d - mid) <= 2).length / depths.length;
    if (consistent >= 0.8) {
      widths.push(mid / PX_PER_MM);
      colours.push(refs.map(median));
    }
  }

  // The largest group of sides whose widths agree to within 0.6 mm.
  widths.sort((a, b) => a - b);
  let agreed: number[] = [];
  for (const low of widths) {
    const group = widths.filter((w) => w >= low && w <= low + 0.6);
    if (group.length > agreed.length) agreed = group;
  }
  if (agreed.length < 3) return 0;
  const width = agreed.reduce((a, b) => a + b, 0) / agreed.length;
  if (width < 1 || width > 1.9) return 0;

  const [r, g, b] = [0, 1, 2].map((c) => colours.reduce((sum, col) => sum + col[c], 0) / colours.length);
  if (r - b < 40 || r < g - 10) return 0;

  // Adding border shrinks the existing one slightly, so solve for the total rather than the gap.
  const add = (MODERN_BORDER_MM - width) / (1 - (2 * width) / CARD_WIDTH_MM);
  return Math.round(add * 20) / 20;
}

/** Corner radius as a CSS value relative to the card box, so it scales with any rendered size. */
export function cornerRadiusCss(s: Settings): string | undefined {
  if (!s.roundCorners) return undefined;
  return `${(s.cornerRadius / s.cardWidth) * 100}% / ${(s.cornerRadius / s.cardHeight) * 100}%`;
}

const toHex = (r: number, g: number, b: number) =>
  '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');

/**
 * The card's border colour: the median of the pixels just inside each edge, ignoring the corners
 * (which are often transparent or rounded off) and anything see-through.
 */
export function detectBorderColor(img: CanvasImageSource): string {
  const W = 63;
  const H = 88;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, W, H);
  const data = ctx.getImageData(0, 0, W, H).data;
  const channels: number[][] = [[], [], []];
  const sample = (x: number, y: number) => {
    const i = (y * W + x) * 4;
    if (data[i + 3] < 200) return;
    for (let c = 0; c < 3; c++) channels[c].push(data[i + c]);
  };
  for (let x = 10; x < W - 10; x++) {
    sample(x, 1);
    sample(x, H - 2);
  }
  for (let y = 12; y < H - 12; y++) {
    sample(1, y);
    sample(W - 2, y);
  }
  if (!channels[0].length) return '#ffffff';
  const median = (v: number[]) => v.sort((a, b) => a - b)[v.length >> 1];
  return toHex(median(channels[0]), median(channels[1]), median(channels[2]));
}

/**
 * Shrinks the artwork inside the card and fills the freed margin so the card gains a wider border
 * while keeping its outer size. `bx`/`by` are the added border as a fraction of the card's width
 * and height. With no `color`, the margin continues the card's own edge colours, so gradients and
 * tints in the original border carry on outwards; with a `color`, it is filled flat.
 */
export function renderFace(img: HTMLImageElement, bx: number, by: number, color?: string): HTMLCanvasElement {
  const W = img.naturalWidth;
  const H = img.naturalHeight;
  const ix = Math.round(W * Math.min(bx, 0.4));
  const iy = Math.round(H * Math.min(by, 0.4));
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = color ?? detectBorderColor(img);
  ctx.fillRect(0, 0, W, H);

  if (!color) {
    // Take a thin strip just inside each edge (clear of scan shadow and rounded corners), average
    // it into a few samples so print texture doesn't become streaks, and stretch it over the margin.
    const SAMPLES = 6;
    const strip = document.createElement('canvas');
    const sctx = strip.getContext('2d')!;
    const smear = (sx: number, sy: number, sw: number, sh: number, dx: number, dy: number, dw: number, dh: number) => {
      const horizontal = sw > sh;
      strip.width = horizontal ? SAMPLES : 1;
      strip.height = horizontal ? 1 : SAMPLES;
      sctx.clearRect(0, 0, strip.width, strip.height);
      sctx.drawImage(img, sx, sy, sw, sh, 0, 0, strip.width, strip.height);
      ctx.drawImage(strip, dx, dy, dw, dh);
    };
    const tx = Math.max(1, Math.round(W * 0.012));
    const ty = Math.max(1, Math.round(H * 0.009));
    const padX = W * 0.12;
    const padY = H * 0.1;
    smear(padX, ty, W - 2 * padX, ty, 0, 0, W, iy + 1);
    smear(padX, H - 2 * ty, W - 2 * padX, ty, 0, H - iy - 1, W, iy + 1);
    smear(tx, padY, tx, H - 2 * padY, 0, iy, ix + 1, H - 2 * iy);
    smear(W - 2 * tx, padY, tx, H - 2 * padY, W - ix - 1, iy, ix + 1, H - 2 * iy);
  }

  ctx.drawImage(img, ix, iy, W - 2 * ix, H - 2 * iy);
  return canvas;
}

/** One rendered variant is kept per image, so dragging a slider doesn't pile up large data URLs. */
const faces = new Map<string, { key: string; url: Promise<string | null> }>();

/** The bordered card as an image URL, for on-screen previews. */
export function faceDataUrl(src: string, bx: number, by: number, color?: string): Promise<string | null> {
  const key = `${bx.toFixed(4)}|${by.toFixed(4)}|${color ?? 'auto'}`;
  const hit = faces.get(src);
  if (hit?.key === key) return hit.url;
  const url = loadImage(src).then((img) => {
    if (!img) return null;
    try {
      return renderFace(img, bx, by, color).toDataURL('image/jpeg', 0.9);
    } catch {
      return null;
    }
  });
  faces.set(src, { key, url });
  return url;
}
