import { useState } from 'react';
import Cropper, { type Area } from 'react-easy-crop';
import { renderCrop } from '../lib/images';
import { CARD_H, CARD_W, type CropJob, type CropState } from '../lib/types';

const ASPECT = CARD_W / CARD_H;

interface Props {
  job: CropJob;
  remaining: number;
  onDone: (job: CropJob, result: { name: string; src: string; crop: CropState }) => void;
  onSkip: () => void;
  onCancelAll: () => void;
}

export function CropDialog({ job, remaining, onDone, onSkip, onCancelAll }: Props) {
  const [crop, setCrop] = useState({ x: job.crop?.x ?? 0, y: job.crop?.y ?? 0 });
  const [zoom, setZoom] = useState(job.crop?.zoom ?? 1);
  const [rotation, setRotation] = useState(job.crop?.rotation ?? 0);
  const [background, setBackground] = useState(job.crop?.background ?? '#ffffff');
  const [name, setName] = useState(job.name);
  const [area, setArea] = useState<Area | null>(null);
  const [natural, setNatural] = useState({ w: CARD_W, h: CARD_H });
  const [saving, setSaving] = useState(false);

  /** Zoom at which the whole (rotated) image sits inside the card frame. */
  const fitZoom = () => {
    const rad = (rotation * Math.PI) / 180;
    const boxW = Math.abs(Math.cos(rad)) * natural.w + Math.abs(Math.sin(rad)) * natural.h;
    const boxH = Math.abs(Math.sin(rad)) * natural.w + Math.abs(Math.cos(rad)) * natural.h;
    const imgAspect = boxW / boxH;
    return Math.min(ASPECT / imgAspect, imgAspect / ASPECT);
  };

  const save = async () => {
    if (!area) return;
    setSaving(true);
    const src = await renderCrop(job.original, area, rotation, background);
    setSaving(false);
    if (src) onDone(job, { name: name.trim() || 'Custom card', src, crop: { ...crop, zoom, rotation, background } });
  };

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="Crop card image">
      <div className="dialog">
        <header>
          <h2>Crop to card size</h2>
          {remaining > 0 && <span className="muted">{remaining} more queued</span>}
        </header>
        <div className="crop-stage" style={{ background }}>
          <Cropper
            image={job.original}
            crop={crop}
            zoom={zoom}
            rotation={rotation}
            aspect={ASPECT}
            minZoom={0.2}
            maxZoom={6}
            zoomSpeed={0.25}
            restrictPosition={false}
            showGrid={false}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onRotationChange={setRotation}
            onCropComplete={(_, px) => setArea(px)}
            onMediaLoaded={(m) => setNatural({ w: m.naturalWidth, h: m.naturalHeight })}
          />
        </div>
        <p className="hint">Drag to position, scroll or pinch to scale. The frame is a standard 63 × 88 mm card.</p>
        <div className="crop-controls">
          <label className="field wide">
            <span>Name</span>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="field wide">
            <span>Scale {Math.round(zoom * 100)}%</span>
            <input type="range" min={0.2} max={6} step={0.01} value={zoom} onChange={(e) => setZoom(+e.target.value)} />
          </label>
          <label className="field wide">
            <span>Rotate {Math.round(rotation)}°</span>
            <input type="range" min={-180} max={180} step={1} value={rotation} onChange={(e) => setRotation(+e.target.value)} />
          </label>
          <div className="row">
            <button
              type="button"
              title="Scale so the image covers the whole card"
              onClick={() => {
                setZoom(1);
                setCrop({ x: 0, y: 0 });
              }}
            >
              Fill card
            </button>
            <button
              type="button"
              title="Scale so the whole image is visible"
              onClick={() => {
                setZoom(Math.max(0.2, fitZoom()));
                setCrop({ x: 0, y: 0 });
              }}
            >
              Fit whole image
            </button>
            <button type="button" onClick={() => setRotation((r) => (((r + 90 + 180) % 360) + 360) % 360 - 180)}>
              Rotate 90°
            </button>
            <label className="inline-color" title="Colour shown where the image doesn't cover the card">
              Fill
              <input type="color" value={background} onChange={(e) => setBackground(e.target.value)} />
            </label>
          </div>
        </div>
        <footer>
          <button type="button" onClick={onCancelAll}>
            Cancel
          </button>
          {remaining > 0 && (
            <button type="button" onClick={onSkip}>
              Skip
            </button>
          )}
          <button type="button" className="primary" disabled={!area || saving} onClick={save}>
            {saving ? 'Saving…' : job.cardId ? 'Save card' : 'Add card'}
          </button>
        </footer>
      </div>
    </div>
  );
}
