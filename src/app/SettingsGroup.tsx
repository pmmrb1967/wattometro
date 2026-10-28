// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * A group of "Definições" that opens and closes: closed at first, open when a
 * link points at it ("/definicoes#tarifario", the index at the top).
 */
import { useState, type ReactNode } from 'react';
import { useLocation } from 'react-router';

export function SettingsGroup({
  id,
  name,
  children,
}: {
  id: string;
  name: string;
  children: ReactNode;
}) {
  const { hash, key } = useLocation();
  const [open, setOpen] = useState(hash === `#${id}`);
  // Each new link to it opens it, even one followed before (a new location key).
  const [seen, setSeen] = useState(key);
  if (key !== seen) {
    setSeen(key);
    if (hash === `#${id}`) setOpen(true);
  }
  return (
    <details
      id={id}
      className="group settings-group"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>{name}</summary>
      {children}
    </details>
  );
}
