import { CARD_H, CARD_W } from './types';

export function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    if (!src.startsWith('data:')) img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

const MAX_ORIGINAL = 2400;

/** Reads an uploaded file as a data URL, downscaling very large images to keep storage manageable. */
export async function readImageFile(file: File): Promise<string | null> {
  const dataUrl = await new Promise<string | null>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
  if (!dataUrl) return null;
  const img = await loadImage(dataUrl);
  if (!img) return null;
  const longest = Math.max(img.naturalWidth, img.naturalHeight);
  if (longest <= MAX_ORIGINAL) return dataUrl;
  const k = MAX_ORIGINAL / longest;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.naturalWidth * k);
  canvas.height = Math.round(img.naturalHeight * k);
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return file.type === 'image/png' ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', 0.92);
}

export interface PixelArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 12 px/mm, roughly 300 DPI at true card size. */
const BASE_W = CARD_W * 12;

/**
 * Renders the selected region to a card-shaped image. `area` is in source pixels relative to the
 * bounding box of the rotated image, and may extend past it (filled with `background`).
 */
export async function renderCrop(
  src: string,
  area: PixelArea,
  rotation: number,
  background: string,
): Promise<string | null> {
  const img = await loadImage(src);
  if (!img || area.width <= 0) return null;
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const rad = (rotation * Math.PI) / 180;
  const boxW = Math.abs(Math.cos(rad)) * w + Math.abs(Math.sin(rad)) * h;
  const boxH = Math.abs(Math.sin(rad)) * w + Math.abs(Math.cos(rad)) * h;

  const outW = Math.round(BASE_W * Math.min(2, Math.max(1, area.width / BASE_W)));
  const outH = Math.round((outW * CARD_H) / CARD_W);
  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, outW, outH);
  ctx.imageSmoothingQuality = 'high';
  const k = outW / area.width;
  ctx.scale(k, k);
  ctx.translate(-area.x + boxW / 2, -area.y + boxH / 2);
  ctx.rotate(rad);
  ctx.drawImage(img, -w / 2, -h / 2);
  return canvas.toDataURL('image/jpeg', 0.95);
}
