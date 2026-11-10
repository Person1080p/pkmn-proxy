import { get, set } from 'idb-keyval';
import { DEFAULT_SETTINGS, type Card, type Settings } from './types';

const SETTINGS_KEY = 'pkmn-proxy:settings';
const CARDS_KEY = 'pkmn-proxy:cards';

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const isColor = (v: string) => /^#[0-9a-f]{6}$/i.test(v);

/** Merges untrusted input (session storage, imported JSON) over the defaults. */
export function sanitizeSettings(raw: unknown): Settings {
  const out: Settings = { ...DEFAULT_SETTINGS };
  if (!raw || typeof raw !== 'object') return out;
  const wrapped = (raw as { settings?: unknown }).settings;
  const src = (wrapped && typeof wrapped === 'object' ? wrapped : raw) as Record<string, unknown>;
  const target = out as unknown as Record<string, unknown>;
  for (const [key, def] of Object.entries(DEFAULT_SETTINGS)) {
    const v = src[key];
    if (typeof v !== typeof def) continue;
    if (typeof v === 'number' && !Number.isFinite(v)) continue;
    target[key] = v;
  }
  if (out.unit !== 'mm' && out.unit !== 'in') out.unit = DEFAULT_SETTINGS.unit;
  if (!['none', 'marks', 'lines'].includes(out.guides)) out.guides = DEFAULT_SETTINGS.guides;
  if (out.lookupScope !== 'standard' && out.lookupScope !== 'all') out.lookupScope = DEFAULT_SETTINGS.lookupScope;
  if (out.pdfImageFormat !== 'jpeg' && out.pdfImageFormat !== 'png') out.pdfImageFormat = 'jpeg';
  for (const k of ['guideColor', 'pageBackground', 'cornerFillColor'] as const) {
    if (!isColor(out[k])) out[k] = DEFAULT_SETTINGS[k];
  }
  out.pageWidth = clamp(out.pageWidth, 20, 2000);
  out.pageHeight = clamp(out.pageHeight, 20, 2000);
  out.cols = clamp(Math.round(out.cols), 1, 20);
  out.rows = clamp(Math.round(out.rows), 1, 20);
  out.cardWidth = clamp(out.cardWidth, 10, 500);
  out.cardHeight = clamp(out.cardHeight, 10, 500);
  out.cardScale = clamp(out.cardScale, 10, 300);
  out.gapX = clamp(out.gapX, 0, 100);
  out.gapY = clamp(out.gapY, 0, 100);
  out.offsetX = clamp(out.offsetX, -500, 500);
  out.offsetY = clamp(out.offsetY, -500, 500);
  out.addBorder = clamp(out.addBorder, 0, 10);
  out.cornerRadius = clamp(out.cornerRadius, 0, 10);
  out.guideWidth = clamp(out.guideWidth, 0.05, 2);
  out.dpi = clamp(Math.round(out.dpi), 72, 600);
  out.jpegQuality = clamp(out.jpegQuality, 0.3, 1);
  out.previewZoom = clamp(out.previewZoom, 0.1, 4);
  out.fileName = out.fileName.replace(/[\\/:*?"<>|]/g, '').trim() || DEFAULT_SETTINGS.fileName;
  return out;
}

export function loadSettings(): Settings {
  try {
    const raw = sessionStorage.getItem(SETTINGS_KEY);
    return sanitizeSettings(raw ? JSON.parse(raw) : null);
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s: Settings): void {
  try {
    sessionStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    // Storage unavailable (private mode, quota): settings just won't persist.
  }
}

export function settingsToJson(s: Settings): string {
  return JSON.stringify({ app: 'pkmn-proxy', version: 1, settings: s }, null, 2);
}

/** Cards include uploaded images, which are too large for sessionStorage, so they live in IndexedDB. */
export async function loadCards(): Promise<Card[]> {
  try {
    const cards = await get<Card[]>(CARDS_KEY);
    return Array.isArray(cards) ? cards : [];
  } catch {
    return [];
  }
}

export async function saveCards(cards: Card[]): Promise<void> {
  try {
    await set(CARDS_KEY, cards);
  } catch {
    // Non-fatal: the list simply won't survive a reload.
  }
}
