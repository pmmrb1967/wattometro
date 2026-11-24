// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * A secret field (an AI key, the cloud password) with the app's own eye that
 * shows it. Edge's built-in eye is hidden in these fields (index.css): it goes
 * away for good once the field loses focus, and two eyes would be confusing.
 */
import { useState, type InputHTMLAttributes, type ReactNode } from 'react';

export function EyeIcon({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path
        d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="1.8" />
      {!open && (
        <path d="M4 20 20 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      )}
    </svg>
  );
}

export function SecretInput({
  label,
  showLabel,
  hideLabel,
  ...input
}: {
  label: ReactNode;
  showLabel: string;
  hideLabel: string;
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  const [shown, setShown] = useState(false);
  return (
    // The eye sits over the field, outside the label, so it is not part of the field's name.
    <div className="secret-field">
      <label>
        {label}
        <input {...input} type={shown ? 'text' : 'password'} />
      </label>
      <button
        type="button"
        className="secret-toggle"
        aria-label={shown ? hideLabel : showLabel}
        title={shown ? hideLabel : showLabel}
        aria-pressed={shown}
        onClick={() => setShown(!shown)}
      >
        <EyeIcon open={!shown} />
      </button>
    </div>
  );
}
