import { useEffect, useState, type ReactNode } from 'react';
import type { Unit } from '../lib/types';

interface NumProps {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  step?: number;
  digits?: number;
  suffix?: string;
  disabled?: boolean;
}

/** Numeric input that tolerates partial typing and only reports valid, in-range values. */
export function NumField({ label, value, onChange, min = -Infinity, max = Infinity, step = 1, digits = 2, suffix, disabled }: NumProps) {
  const rounded = +value.toFixed(digits);
  const [text, setText] = useState(String(rounded));

  useEffect(() => {
    setText((t) => (parseFloat(t) === rounded ? t : String(rounded)));
  }, [rounded]);

  return (
    <label className="field">
      <span>{label}</span>
      <div className="input-wrap">
        <input
          type="number"
          value={text}
          step={step}
          disabled={disabled}
          min={Number.isFinite(min) ? min : undefined}
          max={Number.isFinite(max) ? max : undefined}
          onChange={(e) => {
            setText(e.target.value);
            const n = parseFloat(e.target.value);
            if (Number.isFinite(n) && n >= min && n <= max) onChange(n);
          }}
          onBlur={() => setText(String(rounded))}
        />
        {suffix && <em>{suffix}</em>}
      </div>
    </label>
  );
}

interface LenProps {
  label: string;
  /** Millimetres. */
  value: number;
  onChange: (mm: number) => void;
  unit: Unit;
  min?: number;
  max?: number;
  disabled?: boolean;
}

/** Length input stored in mm but shown and edited in the chosen unit. */
export function LenField({ label, value, onChange, unit, min = 0, max = 2000, disabled }: LenProps) {
  const f = unit === 'in' ? 25.4 : 1;
  return (
    <NumField
      label={label}
      value={value / f}
      onChange={(n) => onChange(n * f)}
      min={+(min / f).toFixed(3)}
      max={+(max / f).toFixed(3)}
      step={unit === 'in' ? 0.05 : 0.5}
      digits={unit === 'in' ? 3 : 2}
      suffix={unit}
      disabled={disabled}
    />
  );
}

export function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="field">
      <span>{label}</span>
      <div className="input-wrap color">
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} />
        <code>{value}</code>
      </div>
    </label>
  );
}

interface SectionProps {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
  /** Set together with `onToggle` to control the section from outside. */
  open?: boolean;
  onToggle?: (open: boolean) => void;
}

export function Section({ title, children, defaultOpen = true, open, onToggle }: SectionProps) {
  return (
    <details className="section" open={open ?? defaultOpen} onToggle={(e) => onToggle?.(e.currentTarget.open)}>
      <summary>{title}</summary>
      <div className="section-body">{children}</div>
    </details>
  );
}
