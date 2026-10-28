// SPDX-License-Identifier: AGPL-3.0-or-later
import { useId, useState, type ReactNode } from 'react';
import { t } from '../i18n/pt-PT';

/**
 * An (i) next to a field's label: the note shows on hover and on a tap or
 * click (touch screens have no hover), and hides again on a second tap or
 * when the focus moves on. `inline`: next to a value rather than a field, the
 * note as wide as its words (its container is `.has-info`).
 */
export function InfoTip({ text, inline = false }: { text: string; inline?: boolean }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <span className={inline ? 'info-tip inline' : 'info-tip'}>
      <button
        type="button"
        className="info-button"
        aria-label={t.infoLabel}
        aria-expanded={open}
        aria-describedby={id}
        onClick={() => setOpen(!open)}
        onBlur={() => setOpen(false)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setOpen(false);
        }}
      >
        i
      </button>
      <span id={id} role="tooltip" className={open ? 'info-text open' : 'info-text'}>
        {text}
      </span>
    </span>
  );
}

/** A form field whose label carries an (i): the label points at the control by id. */
export function Field({
  label,
  info,
  hint,
  children,
}: {
  label: string;
  info?: string;
  hint?: string;
  children: (id: string) => ReactNode;
}) {
  const id = useId();
  return (
    <label htmlFor={id}>
      <span className="field-label">
        {label}
        {info && <InfoTip text={info} />}
      </span>
      {children(id)}
      {hint && <span className="hint">{hint}</span>}
    </label>
  );
}
