// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * A link to a part of a page ("/consumo#previsao", "/definicoes#tarifario")
 * scrolls to it. The router does not, and the part may only appear once the
 * page's data is in: it is looked for a few times, then given up.
 */
import { useEffect } from 'react';
import { useLocation } from 'react-router';

const TRIES = 30;
const EVERY_MS = 100;

export function useHashScroll(): void {
  const { hash, key } = useLocation();
  useEffect(() => {
    if (!hash) return;
    const id = decodeURIComponent(hash.slice(1));
    let tries = 0;
    const timer = window.setInterval(() => {
      const target = document.getElementById(id);
      tries++;
      if (target) target.scrollIntoView({ block: 'start' });
      if (target || tries >= TRIES) window.clearInterval(timer);
    }, EVERY_MS);
    return () => window.clearInterval(timer);
  }, [hash, key]);
}
