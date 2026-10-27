// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * A card's notes (how it is calculated, its limits) closed under one line, so
 * the conclusion is what the card shows; open on print (src/index.css).
 */
import type { ReactNode } from 'react';
import { t } from '../i18n/pt-PT';

export function HowItWorks({ children }: { children: ReactNode }) {
  return (
    <details className="how">
      <summary>{t.howItWorks}</summary>
      {children}
    </details>
  );
}
