export type Unit = 'mm' | 'in';
export type GuideStyle = 'none' | 'marks' | 'lines';
export type LookupScope = 'standard' | 'all';
export type CardCategory = 'pokemon' | 'trainer' | 'energy';

/** All lengths are stored in millimetres regardless of the display unit. */
export interface Settings {
  unit: Unit;
  pageWidth: number;
  pageHeight: number;
  cols: number;
  rows: number;
  cardWidth: number;
  cardHeight: number;
  /** Percentage applied to the card size when printing (100 = true size). */
  cardScale: number;
  gapX: number;
  gapY: number;
  /** Nudges the whole grid, to compensate for printer misalignment. */
  offsetX: number;
  offsetY: number;
  guides: GuideStyle;
  guideColor: string;
  guideWidth: number;
  pageBackground: string;
  /** Paint a solid colour behind each card so transparent rounded corners are filled. */
  cornerFill: boolean;
  cornerFillColor: string;
  /** Extra border added inside every card (mm), filled from the card's own edge colour. */
  addBorder: number;
  /** Widen the border of scans that were cropped much tighter than a modern card. */
  autoBorder: boolean;
  /** Cut the card image to the standard rounded corner. */
  roundCorners: boolean;
  cornerRadius: number;
  dpi: number;
  pdfImageFormat: 'jpeg' | 'png';
  jpegQuality: number;
  fileName: string;
  previewZoom: number;
  /** Which card pool the name lookup searches. */
  lookupScope: LookupScope;
}

export interface CropState {
  x: number;
  y: number;
  zoom: number;
  rotation: number;
  background: string;
}

export interface Card {
  id: string;
  name: string;
  qty: number;
  /** Remote URL (deck cards) or data URL (custom cards). */
  src: string;
  kind: 'deck' | 'custom';
  set?: string;
  number?: string;
  /** Uncropped upload, kept so a custom card can be re-cropped. */
  original?: string;
  crop?: CropState;
  /** Used to group the exported deck list. */
  category?: CardCategory;
  /** Border (mm) the thin-border check wants to add; 0 once checked and found normal. */
  autoBorder?: number;
  /** Added border for this card in mm; overrides the automatic and global amounts when set. */
  border?: number;
  /** Flat colour for the added border; when unset it is matched to the card's edge. */
  borderColor?: string;
}

export interface CropJob {
  key: string;
  /** When set, the result replaces this card's image instead of adding a card. */
  cardId?: string;
  name: string;
  original: string;
  crop?: CropState;
}

export const CARD_W = 63;
export const CARD_H = 88;

export const PAGE_PRESETS: { name: string; w: number; h: number }[] = [
  { name: 'Letter (8.5 × 11 in)', w: 215.9, h: 279.4 },
  { name: 'A4 (210 × 297 mm)', w: 210, h: 297 },
  { name: 'Legal (8.5 × 14 in)', w: 215.9, h: 355.6 },
  { name: 'Tabloid (11 × 17 in)', w: 279.4, h: 431.8 },
  { name: 'A3 (297 × 420 mm)', w: 297, h: 420 },
  { name: 'Super B (13 × 19 in)', w: 330.2, h: 482.6 },
  { name: 'A5 (148 × 210 mm)', w: 148, h: 210 },
  { name: 'Photo (4 × 6 in)', w: 101.6, h: 152.4 },
];

export const DEFAULT_SETTINGS: Settings = {
  unit: 'in',
  pageWidth: 215.9,
  pageHeight: 279.4,
  cols: 3,
  rows: 3,
  cardWidth: CARD_W,
  cardHeight: CARD_H,
  cardScale: 100,
  gapX: 0,
  gapY: 0,
  offsetX: 0,
  offsetY: 0,
  guides: 'marks',
  guideColor: '#000000',
  guideWidth: 0.15,
  pageBackground: '#ffffff',
  cornerFill: false,
  cornerFillColor: '#000000',
  addBorder: 0,
  autoBorder: true,
  roundCorners: false,
  cornerRadius: 3,
  dpi: 300,
  pdfImageFormat: 'jpeg',
  jpegQuality: 0.92,
  fileName: 'proxies',
  previewZoom: 0.6,
  lookupScope: 'standard',
};
