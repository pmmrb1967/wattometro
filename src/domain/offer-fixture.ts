// SPDX-License-Identifier: AGPL-3.0-or-later
/** A synthetic ERSE offer at 6,9 kVA, for tests. */
import type { CyclePrices, Offer } from './erse';

export function offer(
  id: string,
  prices: Partial<Record<'1' | '2' | '3', CyclePrices>>,
  extra: Partial<Offer> = {},
): Offer {
  return {
    id,
    supplier: `Comercializador ${id}`,
    name: `Oferta ${id}`,
    segment: 'Dom',
    supply: 'ELE',
    durationMonths: null,
    validFrom: null,
    validTo: null,
    loyalty: false,
    indexedPrices: false,
    renewable: false,
    restrictions: false,
    requiredServices: false,
    servicesPerYearWithVat: 0,
    discounts: { fixedPerYear: 0, fixedTermPct: 0, energyPct: 0, energyPerKwh: 0 },
    newClientDiscounts: { fixedPerYearWithVat: 0, fixedTermPct: 0, energyPct: 0, energyPerKwh: 0 },
    payment: { directDebit: true, multibanco: true, cash: false },
    billing: { electronic: true, paper: true },
    links: {},
    texts: {},
    prices: { '6.9': prices },
    ...extra,
  };
}
