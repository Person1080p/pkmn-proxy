import { useEffect, useState } from 'react';
import { cornerRadiusCss, faceDataUrl } from '../lib/face';
import type { Settings } from '../lib/types';

interface Props {
  src: string;
  alt: string;
  /** Added border in mm. */
  border: number;
  borderColor?: string;
  settings: Settings;
  onError?: () => void;
}

/** A card image as it will print: with any added border and the corner crop applied. */
export function CardFace({ src, alt, border, borderColor, settings: s, onError }: Props) {
  const [face, setFace] = useState<{ for: string; url: string } | null>(null);
  const bx = border / s.cardWidth;
  const by = border / s.cardHeight;
  const key = `${src}|${bx}|${by}|${borderColor ?? ''}`;

  useEffect(() => {
    if (border <= 0) return;
    let live = true;
    void faceDataUrl(src, bx, by, borderColor).then((url) => live && url && setFace({ for: key, url }));
    return () => {
      live = false;
    };
  }, [src, bx, by, borderColor, border, key]);

  // Until the bordered version is ready (or if it can't be made), show the plain image.
  const shown = border > 0 && face?.for === key ? face.url : src;
  return (
    <img
      src={shown}
      alt={alt}
      crossOrigin={shown.startsWith('data:') ? undefined : 'anonymous'}
      draggable={false}
      style={{ borderRadius: cornerRadiusCss(s) }}
      onError={onError}
    />
  );
}
