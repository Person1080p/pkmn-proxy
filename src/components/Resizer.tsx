import { useRef } from 'react';
import { PANEL_DEFAULT, PANEL_MAX, PANEL_MIN } from '../lib/types';

interface Props {
  /** Which panel this divider resizes. */
  side: 'left' | 'right';
  width: number;
  onWidth: (px: number) => void;
}

/** Draggable divider between a side panel and the preview. Double-click resets the width. */
export function Resizer({ side, width, onWidth }: Props) {
  const drag = useRef<{ x: number; width: number } | null>(null);
  const set = (px: number) => onWidth(Math.round(Math.max(PANEL_MIN, Math.min(PANEL_MAX, px))));
  const grow = side === 'left' ? 1 : -1;

  return (
    <div
      className="resizer"
      role="separator"
      aria-orientation="vertical"
      aria-label={side === 'left' ? 'Resize cards panel' : 'Resize settings panel'}
      aria-valuemin={PANEL_MIN}
      aria-valuemax={PANEL_MAX}
      aria-valuenow={width}
      tabIndex={0}
      title="Drag to resize · double-click to reset"
      onPointerDown={(e) => {
        // Start from the width actually on screen, which may be narrower than the stored one.
        const panel = side === 'left' ? e.currentTarget.previousElementSibling : e.currentTarget.nextElementSibling;
        drag.current = { x: e.clientX, width: panel?.getBoundingClientRect().width ?? width };
        e.currentTarget.setPointerCapture(e.pointerId);
        e.preventDefault();
      }}
      onPointerMove={(e) => {
        if (drag.current) set(drag.current.width + grow * (e.clientX - drag.current.x));
      }}
      onPointerUp={() => (drag.current = null)}
      onPointerCancel={() => (drag.current = null)}
      onDoubleClick={() => set(PANEL_DEFAULT)}
      onKeyDown={(e) => {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
        e.preventDefault();
        set(width + grow * (e.key === 'ArrowRight' ? 16 : -16));
      }}
    />
  );
}
