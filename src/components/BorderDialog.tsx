import { useEffect, useState } from 'react';
import { defaultBorder, detectBorderColor } from '../lib/face';
import { loadImage } from '../lib/images';
import type { Card, Settings } from '../lib/types';
import { CardFace } from './CardFace';
import { LenField } from './fields';

export interface BorderChoice {
  border?: number;
  borderColor?: string;
}

interface Props {
  card: Card;
  settings: Settings;
  onSave: (choice: BorderChoice, allCards: boolean) => void;
  onClose: () => void;
}

export function BorderDialog({ card, settings: s, onSave, onClose }: Props) {
  const [useDefault, setUseDefault] = useState(card.border === undefined);
  const automatic = defaultBorder(card, s);
  const autoFixed = s.autoBorder && (card.autoBorder ?? 0) > 0;
  const [border, setBorder] = useState(card.border ?? automatic);
  const [custom, setCustom] = useState(card.borderColor !== undefined);
  const [color, setColor] = useState(card.borderColor ?? '#ffffff');
  const [detected, setDetected] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void loadImage(card.src).then((img) => {
      if (!live || !img) return;
      try {
        const found = detectBorderColor(img);
        setDetected(found);
        if (card.borderColor === undefined) setColor(found);
      } catch {
        // Image can't be read; the flat-colour option still works.
      }
    });
    return () => {
      live = false;
    };
  }, [card.src, card.borderColor]);

  const shownBorder = useDefault ? automatic : border;
  const choice: BorderChoice = {
    border: useDefault ? undefined : border,
    borderColor: custom ? color : undefined,
  };
  const unit = (mm: number) => (s.unit === 'in' ? `${+(mm / 25.4).toFixed(3)} in` : `${+mm.toFixed(2)} mm`);

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="Adjust card border">
      <div className="dialog border-dialog">
        <header>
          <h2>Border · {card.name}</h2>
        </header>
        <div className="border-body">
          <div className="border-preview" style={{ aspectRatio: `${s.cardWidth} / ${s.cardHeight}` }}>
            <CardFace src={card.src} alt={card.name} border={shownBorder} borderColor={choice.borderColor} settings={s} />
          </div>
          <div className="border-controls">
            <label className="check">
              <input type="checkbox" checked={useDefault} onChange={(e) => setUseDefault(e.target.checked)} />
              Automatic ({unit(automatic)}
              {autoFixed ? ', widened because this scan’s border is thin' : ''})
            </label>
            <div className="border-size">
              <LenField label="Added border" unit={s.unit} value={shownBorder} max={10} disabled={useDefault} onChange={setBorder} />
              <input
                type="range"
                aria-label="Added border"
                min={0}
                max={8}
                step={0.05}
                value={Math.min(8, shownBorder)}
                disabled={useDefault}
                onChange={(e) => setBorder(+e.target.value)}
              />
            </div>
            <p className="hint">
              The artwork shrinks to make room, so the card stays the same size. Use this for scans cropped too
              tightly, where the border is thinner than on a real card.
            </p>
            <fieldset className="radio">
              <legend>Border fill</legend>
              <label className="check">
                <input type="radio" name="fill" checked={!custom} onChange={() => setCustom(false)} />
                Match the card’s edge automatically
                {detected && <span className="swatch" style={{ background: detected }} />}
              </label>
              <label className="check">
                <input type="radio" name="fill" checked={custom} onChange={() => setCustom(true)} />
                Flat colour
                <input
                  type="color"
                  value={color}
                  onChange={(e) => {
                    setColor(e.target.value);
                    setCustom(true);
                  }}
                />
              </label>
            </fieldset>
          </div>
        </div>
        <footer>
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="button" title="Give every card in the list this border" onClick={() => onSave(choice, true)}>
            Apply to all cards
          </button>
          <button type="button" className="primary" onClick={() => onSave(choice, false)}>
            Save
          </button>
        </footer>
      </div>
    </div>
  );
}
