import { jsPDF } from 'jspdf';
import JSZip from 'jszip';
import { printImageUrl } from './deck';
import { effectiveBorder, renderFace } from './face';
import { loadImage } from './images';
import { computeLayout, expandCards, guideSegments, paginate } from './layout';
import type { Card, Settings } from './types';

export interface ExportResult {
  pages: number;
  /** Names of cards whose image could not be loaded (printed as placeholders). */
  missing: string[];
}

type Progress = (message: string) => void;

const MM_PER_INCH = 25.4;

function drawCard(
  ctx: CanvasRenderingContext2D,
  img: CanvasImageSource | null,
  card: Card,
  x: number,
  y: number,
  w: number,
  h: number,
  s: Settings,
) {
  if (s.cornerFill) {
    ctx.fillStyle = s.cornerFillColor;
    ctx.fillRect(x, y, w, h);
  }
  ctx.save();
  if (s.roundCorners && s.cornerRadius > 0) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, [{ x: (s.cornerRadius / s.cardWidth) * w, y: (s.cornerRadius / s.cardHeight) * h }]);
    ctx.clip();
  }
  drawCardFace(ctx, img, card, x, y, w, h);
  ctx.restore();
}

function drawCardFace(
  ctx: CanvasRenderingContext2D,
  img: CanvasImageSource | null,
  card: Card,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  if (img) {
    ctx.drawImage(img, x, y, w, h);
    return;
  }
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = '#888888';
  ctx.lineWidth = Math.max(1, w / 200);
  ctx.strokeRect(x + ctx.lineWidth / 2, y + ctx.lineWidth / 2, w - ctx.lineWidth, h - ctx.lineWidth);
  ctx.fillStyle = '#333333';
  ctx.font = `${Math.round(w / 12)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(card.name, x + w / 2, y + h / 2, w * 0.9);
}

async function loadAll(cards: Card[], s: Settings, onProgress: Progress) {
  const images = new Map<string, CanvasImageSource | null>();
  const missing: string[] = [];
  let done = 0;
  // Small batches keep memory and connection use reasonable for big decks.
  for (let i = 0; i < cards.length; i += 6) {
    await Promise.all(
      cards.slice(i, i + 6).map(async (card) => {
        const full = printImageUrl(card.src);
        const img = (full && (await loadImage(full))) || (await loadImage(card.src));
        const border = effectiveBorder(card, s);
        images.set(
          card.id,
          img && border > 0 ? renderFace(img, border / s.cardWidth, border / s.cardHeight, card.borderColor) : img,
        );
        if (!img) missing.push(card.name);
        onProgress(`Loading images ${++done}/${cards.length}`);
      }),
    );
  }
  return { images, missing };
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function downloadText(text: string, name: string, type = 'application/json') {
  download(new Blob([text], { type }), name);
}

const nextFrame = () => new Promise<void>((r) => setTimeout(r, 0));

export async function exportPdf(cards: Card[], s: Settings, onProgress: Progress): Promise<ExportResult> {
  const printable = cards.filter((c) => c.qty > 0);
  const L = computeLayout(s);
  const pages = paginate(expandCards(printable), L.perPage);
  const { images, missing } = await loadAll(printable, s, onProgress);

  // Each unique card is rasterised once at the target resolution and reused via its alias.
  const pxW = Math.max(1, Math.round((L.cw / MM_PER_INCH) * s.dpi));
  const pxH = Math.max(1, Math.round((L.ch / MM_PER_INCH) * s.dpi));
  const canvas = document.createElement('canvas');
  canvas.width = pxW;
  canvas.height = pxH;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  const encoded = new Map<string, string>();
  const jpeg = s.pdfImageFormat === 'jpeg';
  for (const card of printable) {
    ctx.clearRect(0, 0, pxW, pxH);
    if (jpeg) {
      // JPEG has no alpha; without this, transparent corners would turn black.
      ctx.fillStyle = s.pageBackground;
      ctx.fillRect(0, 0, pxW, pxH);
    }
    drawCard(ctx, images.get(card.id) ?? null, card, 0, 0, pxW, pxH, s);
    encoded.set(card.id, jpeg ? canvas.toDataURL('image/jpeg', s.jpegQuality) : canvas.toDataURL('image/png'));
  }

  const doc = new jsPDF({
    unit: 'mm',
    format: [s.pageWidth, s.pageHeight],
    orientation: s.pageWidth > s.pageHeight ? 'landscape' : 'portrait',
    compress: true,
  });
  const segments = guideSegments(s, L);
  for (let p = 0; p < pages.length; p++) {
    onProgress(`Building page ${p + 1}/${pages.length}`);
    await nextFrame();
    if (p > 0) doc.addPage();
    if (s.pageBackground.toLowerCase() !== '#ffffff') {
      doc.setFillColor(s.pageBackground);
      doc.rect(0, 0, s.pageWidth, s.pageHeight, 'F');
    }
    if (segments.length) {
      doc.setDrawColor(s.guideColor);
      doc.setLineWidth(s.guideWidth);
      for (const [x1, y1, x2, y2] of segments) doc.line(x1, y1, x2, y2);
    }
    pages[p].forEach((card, i) => {
      const { x, y } = L.slots[i];
      doc.addImage(encoded.get(card.id)!, jpeg ? 'JPEG' : 'PNG', x, y, L.cw, L.ch, card.id, 'FAST');
    });
  }
  onProgress('Saving PDF');
  await nextFrame();
  download(doc.output('blob'), `${s.fileName}.pdf`);
  return { pages: pages.length, missing };
}

export async function exportPngZip(cards: Card[], s: Settings, onProgress: Progress): Promise<ExportResult> {
  const printable = cards.filter((c) => c.qty > 0);
  const L = computeLayout(s);
  const pages = paginate(expandCards(printable), L.perPage);
  const { images, missing } = await loadAll(printable, s, onProgress);

  const k = s.dpi / MM_PER_INCH;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(s.pageWidth * k);
  canvas.height = Math.round(s.pageHeight * k);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Page is too large to render at this DPI. Lower the DPI and try again.');
  ctx.imageSmoothingQuality = 'high';
  const segments = guideSegments(s, L);
  const zip = new JSZip();
  const digits = Math.max(2, String(pages.length).length);

  for (let p = 0; p < pages.length; p++) {
    onProgress(`Rendering page ${p + 1}/${pages.length}`);
    await nextFrame();
    ctx.fillStyle = s.pageBackground;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (segments.length) {
      ctx.strokeStyle = s.guideColor;
      ctx.lineWidth = Math.max(1, s.guideWidth * k);
      ctx.beginPath();
      for (const [x1, y1, x2, y2] of segments) {
        ctx.moveTo(x1 * k, y1 * k);
        ctx.lineTo(x2 * k, y2 * k);
      }
      ctx.stroke();
    }
    pages[p].forEach((card, i) => {
      const { x, y } = L.slots[i];
      drawCard(ctx, images.get(card.id) ?? null, card, x * k, y * k, L.cw * k, L.ch * k, s);
    });
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('Page is too large to render at this DPI. Lower the DPI and try again.');
    const bytes = withPngDpi(new Uint8Array(await blob.arrayBuffer()), s.dpi);
    zip.file(`${s.fileName}-page-${String(p + 1).padStart(digits, '0')}.png`, bytes);
  }
  onProgress('Zipping');
  // PNGs are already compressed, so just store them.
  const out = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
  download(out, `${s.fileName}.zip`);
  return { pages: pages.length, missing };
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let i = 0; i < 8; i++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * Inserts a pHYs chunk after IHDR so the PNG carries its physical resolution; print dialogs and
 * image editors then size the page correctly instead of assuming 72/96 DPI.
 */
function withPngDpi(png: Uint8Array, dpi: number): Uint8Array {
  const IHDR_END = 33; // 8-byte signature + 25-byte IHDR chunk
  if (png.length < IHDR_END) return png;
  const ppm = Math.round(dpi / 0.0254);
  const chunk = new Uint8Array(21);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, 9);
  chunk.set([0x70, 0x48, 0x59, 0x73], 4); // "pHYs"
  view.setUint32(8, ppm);
  view.setUint32(12, ppm);
  chunk[16] = 1; // unit: metre
  view.setUint32(17, crc32(chunk.subarray(4, 17)));
  const out = new Uint8Array(png.length + chunk.length);
  out.set(png.subarray(0, IHDR_END), 0);
  out.set(chunk, IHDR_END);
  out.set(png.subarray(IHDR_END), IHDR_END + chunk.length);
  return out;
}
