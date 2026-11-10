import { useEffect, useRef, useState } from 'react';
import { autoFitGrid, type Layout } from '../lib/layout';
import { CARD_H, CARD_W, DEFAULT_SETTINGS, PAGE_PRESETS, type GuideStyle, type Settings, type Unit } from '../lib/types';
import { ColorField, LenField, NumField, Section } from './fields';

interface Props {
  settings: Settings;
  layout: Layout;
  /** Whether any card has had its border widened, by hand or automatically. */
  bordersAdjusted: boolean;
  update: (patch: Partial<Settings>) => void;
  onExportJson: () => void;
  onImportJson: (file: File) => void;
}

const near = (a: number, b: number) => Math.abs(a - b) < 0.2;

export function SettingsPanel({ settings: s, layout, bordersAdjusted, update, onExportJson, onImportJson }: Props) {
  const fileInput = useRef<HTMLInputElement>(null);
  // Collapsed unless some card's border is being adjusted; follows that as cards come and go, and
  // can still be opened or closed by hand in between.
  const [bordersOpen, setBordersOpen] = useState(bordersAdjusted);
  useEffect(() => setBordersOpen(bordersAdjusted), [bordersAdjusted]);
  const landscape = s.pageWidth > s.pageHeight;
  const presetIndex = PAGE_PRESETS.findIndex(
    (p) => (near(p.w, s.pageWidth) && near(p.h, s.pageHeight)) || (near(p.h, s.pageWidth) && near(p.w, s.pageHeight)),
  );
  const fmt = (mm: number) => (s.unit === 'in' ? `${(mm / 25.4).toFixed(2)} in` : `${mm.toFixed(1)} mm`);
  const marginX = Math.min(layout.x0, s.pageWidth - layout.x0 - layout.gridW);
  const marginY = Math.min(layout.y0, s.pageHeight - layout.y0 - layout.gridH);

  return (
    <>
      <Section title="Page">
        <label className="field wide">
          <span>Paper size</span>
          <select
            value={presetIndex}
            onChange={(e) => {
              const p = PAGE_PRESETS[+e.target.value];
              if (p) update(landscape ? { pageWidth: p.h, pageHeight: p.w } : { pageWidth: p.w, pageHeight: p.h });
            }}
          >
            {PAGE_PRESETS.map((p, i) => (
              <option key={p.name} value={i}>
                {p.name}
              </option>
            ))}
            <option value={-1} disabled={presetIndex !== -1}>
              Custom
            </option>
          </select>
        </label>
        <div className="grid2">
          <LenField label="Width" unit={s.unit} value={s.pageWidth} min={20} onChange={(v) => update({ pageWidth: v })} />
          <LenField label="Height" unit={s.unit} value={s.pageHeight} min={20} onChange={(v) => update({ pageHeight: v })} />
        </div>
        <div className="row">
          <button type="button" onClick={() => update({ pageWidth: s.pageHeight, pageHeight: s.pageWidth })}>
            Rotate to {landscape ? 'portrait' : 'landscape'}
          </button>
          <label className="inline-select">
            Units
            <select value={s.unit} onChange={(e) => update({ unit: e.target.value as Unit })}>
              <option value="in">inches</option>
              <option value="mm">mm</option>
            </select>
          </label>
        </div>
        <ColorField label="Page background" value={s.pageBackground} onChange={(v) => update({ pageBackground: v })} />
      </Section>

      <Section title="Grid">
        <div className="grid2">
          <NumField label="Columns" value={s.cols} min={1} max={20} digits={0} onChange={(v) => update({ cols: Math.round(v) })} />
          <NumField label="Rows" value={s.rows} min={1} max={20} digits={0} onChange={(v) => update({ rows: Math.round(v) })} />
        </div>
        <div className="row">
          <button type="button" onClick={() => update(autoFitGrid(s))} title="Use as many cards per page as fit with a 5 mm margin">
            Auto-fit to page
          </button>
        </div>
        {layout.fits ? (
          <p className="hint">
            {layout.perPage} per page · margins {fmt(marginX)} side, {fmt(marginY)} top/bottom
          </p>
        ) : (
          <p className="warn">
            The grid ({fmt(layout.gridW)} × {fmt(layout.gridH)}) runs off the page. Reduce the grid, spacing or card
            scale, or use a larger page.
          </p>
        )}
      </Section>

      <Section title="Spacing & position">
        <div className="grid2">
          <LenField label="Horizontal gap" unit={s.unit} value={s.gapX} max={100} onChange={(v) => update({ gapX: v })} />
          <LenField label="Vertical gap" unit={s.unit} value={s.gapY} max={100} onChange={(v) => update({ gapY: v })} />
          <LenField label="Offset X" unit={s.unit} value={s.offsetX} min={-500} max={500} onChange={(v) => update({ offsetX: v })} />
          <LenField label="Offset Y" unit={s.unit} value={s.offsetY} min={-500} max={500} onChange={(v) => update({ offsetY: v })} />
        </div>
        <p className="hint">The grid is centred on the page; offsets nudge it to correct printer drift.</p>
      </Section>

      <Section title="Card size">
        <div className="grid2">
          <LenField label="Card width" unit={s.unit} value={s.cardWidth} min={10} max={500} onChange={(v) => update({ cardWidth: v })} />
          <LenField label="Card height" unit={s.unit} value={s.cardHeight} min={10} max={500} onChange={(v) => update({ cardHeight: v })} />
        </div>
        <NumField label="Print scale" value={s.cardScale} min={10} max={300} step={1} digits={1} suffix="%" onChange={(v) => update({ cardScale: v })} />
        <div className="row">
          <button type="button" onClick={() => update({ cardWidth: CARD_W, cardHeight: CARD_H, cardScale: 100 })}>
            Reset to 63 × 88 mm
          </button>
        </div>
      </Section>

      <Section title="Borders & corners" open={bordersOpen} onToggle={setBordersOpen}>
        <LenField label="Added border (all cards)" unit={s.unit} value={s.addBorder} max={10} onChange={(v) => update({ addBorder: v })} />
        <p className="hint">
          Widens the border on every card, filled to match each card’s edge. To fix a single tightly cropped scan,
          use “Border” on that card in the list instead.
        </p>
        <label className="check">
          <input type="checkbox" checked={s.autoBorder} onChange={(e) => update({ autoBorder: e.target.checked })} />
          Widen thin borders on old scans
        </label>
        <p className="hint">
          Older cards are often scanned with the yellow border cropped to about half its real width. Those are
          detected and widened to match a modern card (2.5 mm).
        </p>
        <label className="check">
          <input type="checkbox" checked={s.roundCorners} onChange={(e) => update({ roundCorners: e.target.checked })} />
          Crop to standard rounded corners
        </label>
        {s.roundCorners && (
          <LenField label="Corner radius" unit={s.unit} value={s.cornerRadius} max={10} onChange={(v) => update({ cornerRadius: v })} />
        )}
        <label className="check">
          <input type="checkbox" checked={s.cornerFill} onChange={(e) => update({ cornerFill: e.target.checked })} />
          Fill behind corners with a colour
        </label>
        {s.cornerFill && (
          <ColorField label="Corner colour" value={s.cornerFillColor} onChange={(v) => update({ cornerFillColor: v })} />
        )}
      </Section>

      <Section title="Cut guides">
        <label className="field wide">
          <span>Style</span>
          <select value={s.guides} onChange={(e) => update({ guides: e.target.value as GuideStyle })}>
            <option value="none">None</option>
            <option value="marks">Crop marks in margins</option>
            <option value="lines">Full-length lines</option>
          </select>
        </label>
        {s.guides !== 'none' && (
          <div className="grid2">
            <ColorField label="Colour" value={s.guideColor} onChange={(v) => update({ guideColor: v })} />
            <NumField label="Thickness" value={s.guideWidth} min={0.05} max={2} step={0.05} suffix="mm" onChange={(v) => update({ guideWidth: v })} />
          </div>
        )}
      </Section>

      <Section title="Output">
        <label className="field wide">
          <span>File name</span>
          <input
            type="text"
            value={s.fileName}
            onChange={(e) => update({ fileName: e.target.value.replace(/[\\/:*?"<>|]/g, '') })}
            onBlur={() => !s.fileName.trim() && update({ fileName: DEFAULT_SETTINGS.fileName })}
          />
        </label>
        <div className="grid2">
          <label className="field">
            <span>Resolution</span>
            <select value={s.dpi} onChange={(e) => update({ dpi: +e.target.value })}>
              {[...new Set([150, 300, 450, 600, s.dpi])].sort((a, b) => a - b).map((d) => (
                <option key={d} value={d}>
                  {d} DPI
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>PDF images</span>
            <select value={s.pdfImageFormat} onChange={(e) => update({ pdfImageFormat: e.target.value as 'jpeg' | 'png' })}>
              <option value="jpeg">JPEG (smaller)</option>
              <option value="png">PNG (lossless)</option>
            </select>
          </label>
        </div>
        {s.pdfImageFormat === 'jpeg' && (
          <label className="field wide">
            <span>JPEG quality {Math.round(s.jpegQuality * 100)}%</span>
            <input type="range" min={0.3} max={1} step={0.01} value={s.jpegQuality} onChange={(e) => update({ jpegQuality: +e.target.value })} />
          </label>
        )}
        <p className="hint">
          PNG pages are {Math.round((s.pageWidth / 25.4) * s.dpi)} × {Math.round((s.pageHeight / 25.4) * s.dpi)} px. Print at
          100% / “actual size” so cards come out true to scale.
        </p>
      </Section>

      <Section title="Settings file">
        <div className="row">
          <button type="button" onClick={onExportJson}>
            Export JSON
          </button>
          <button type="button" onClick={() => fileInput.current?.click()}>
            Import JSON
          </button>
          <button type="button" onClick={() => update({ ...DEFAULT_SETTINGS })}>
            Reset all
          </button>
        </div>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onImportJson(f);
            e.target.value = '';
          }}
        />
        <p className="hint">Settings are kept for this browser session and restored on reload.</p>
      </Section>
    </>
  );
}
