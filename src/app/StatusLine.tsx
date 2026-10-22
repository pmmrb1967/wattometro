// SPDX-License-Identifier: AGPL-3.0-or-later
/** Outcome line shown under a form. */
export type Status = { kind: 'idle' | 'busy' } | { kind: 'done' | 'error'; text: string };

export function StatusLine({ status }: { status: Status }) {
  if (status.kind === 'done') return <p className="success">{status.text}</p>;
  if (status.kind === 'error') {
    return (
      <p className="error" role="alert">
        {status.text}
      </p>
    );
  }
  return null;
}
