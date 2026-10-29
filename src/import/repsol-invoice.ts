// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * A Repsol electricity invoice (PDF text, read in the browser) → the fields of
 * the tariff form. Layout and mapping in docs/repsol-invoice.md; the row
 * reading comes from the Faturómetro's Repsol parser (src/parsers/repsol.ts).
 * Only what the invoice states is returned: every price is checked against its
 * line's amount, and the lines against the total without VAT, before use.
 */
import {
  centsToMicro,
  parsePtAmount,
  parsePtPercent,
  parsePtPrice,
  sumCents,
  unitsValueCents,
  type Cents,
} from '../lib/money';
import type { BillingPeriod, TariffInput, TariffOption } from '../domain/tariff';
import type { PageText, TextItem } from '../pdf/text';

/** The form fields an invoice can fill; cycle, map and large family are not on it. */
export type InvoiceFields = Partial<
  Pick<
    TariffInput,
    | 'validFrom'
    | 'supplier'
    | 'powerVa'
    | 'option'
    | 'fixedPerDay'
    | 'energy'
    | 'energyDiscountBp'
    | 'socialEnergyPerKwh'
    | 'socialPowerPerDay'
    | 'socialFinancingPerKwh'
    | 'iecPerKwh'
    | 'cavPerMonth'
    | 'dgegPerMonth'
  >
>;

export type InvoiceProblem =
  /** No Repsol electricity invoice page in the PDF. */
  | 'notRepsol'
  /** The lines do not add up to the total without VAT: nothing is trusted. */
  | 'totalMismatch';

export type InvoiceReading =
  | { ok: true; fields: InvoiceFields; periodStart: string; periodEnd: string }
  | { ok: false; problem: InvoiceProblem };

interface Row {
  y: number;
  items: TextItem[];
}

const normalize = (text: string) =>
  text
    .replace(/[\u00a0\u202f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** A page's items in rows (same baseline within 2.5 points), top to bottom, left to right. */
function rows(page: PageText): Row[] {
  const sorted = [...page.items].sort((a, b) => a.y - b.y || a.x - b.x);
  const result: Row[] = [];
  for (const item of sorted) {
    const row = result.at(-1);
    if (row && Math.abs(item.y - row.y) <= 2.5) row.items.push(item);
    else result.push({ y: item.y, items: [item] });
  }
  for (const row of result) row.items.sort((a, b) => a.x - b.x);
  return result;
}

const findItem = (page: PageText, pattern: RegExp) =>
  page.items.find((item) => pattern.test(normalize(item.str)));

/** "€" amounts as printed ("-0,03", "38,75€"). */
const amount = (text: string) => parsePtAmount(normalize(text).replace(/€/g, ''));

/** "1.019,5" / "19" / "1,019178" → millionths (as µ€ are millionths of a euro). */
function millionths(text: string): number | null {
  return parsePtPrice(text.replace(/\./g, ''));
}

/** "150 kWh x 0,160000 €/kWh", "30 dias x -0,216600 €/dia", "1,000000 meses x 2,850000 €/mês". */
const PRICED = /^([\d.]+(?:,\d+)?) (kWh|dias?|meses|mês) x (-?)(\d+(?:,\d+)?) €\/(kWh|dia|mês)$/;
/** "31d/31d x (3,35 € x 1,00%)": a discount as a percentage of a line. */
const PERCENT = /^\d+d\/\d+d x \(-?[\d.]+(?:,\d+)? € x (\d+(?:,\d+)?)%\)$/;

interface Line {
  description: string;
  cents: Cents;
  /** Unit price, µ€ (always positive: the sign is in the description). */
  price?: number;
  unit?: 'kWh' | 'dia' | 'mês';
  /** Discount percentage, hundredths of a percent. */
  percentBp?: number;
  exempt?: boolean;
}

function readLines(page: PageText): { lines: Line[]; netCents: Cents | null } | null {
  const header = findItem(page, /^Descrição$/);
  const valueHeader = findItem(page, /^Valor\(€\)$/);
  const all = rows(page);
  const netRow = all.find((row) => /^Total sem IVA/.test(normalize(row.items[0]?.str ?? '')));
  if (!header || !valueHeader || !netRow) return null;
  const lines: Line[] = [];
  for (const row of all) {
    if (row.y <= header.y + 1 || row.y >= netRow.y) continue;
    const description = row.items.find((item) => item.x < 190 && /\p{L}/u.test(item.str));
    const value = row.items.find(
      (item) =>
        item.x > valueHeader.x - 10 && item.x < valueHeader.x + 25 && amount(item.str) !== null,
    );
    if (!description || !value) continue;
    const name = normalize(description.str);
    if (/^\([a-z]\) IVA/i.test(name)) continue;
    const line: Line = { description: name, cents: amount(value.str) ?? 0 };
    for (const item of row.items) {
      const text = normalize(item.str);
      const priced = PRICED.exec(text);
      const percent = PERCENT.exec(text);
      if (priced) {
        const quantity = millionths(priced[1] ?? '');
        const price = parsePtPrice(priced[4] ?? '');
        if (quantity === null || price === null) continue;
        // The printed price must give the printed amount (to the cent).
        const sign = priced[3] === '-' ? -1 : 1;
        if (Math.abs(sign * unitsValueCents(quantity, price) - line.cents) > 1) continue;
        line.price = price;
        line.unit = priced[5] as Line['unit'];
      } else if (percent) {
        const bp = parsePtPercent(percent[1] ?? '');
        if (bp !== null) line.percentBp = bp;
      } else if (/^Isen\./.test(text)) {
        line.exempt = true;
      }
    }
    lines.push(line);
  }
  const net = netRow.items.map((item) => amount(item.str)).find((cents) => cents !== null);
  return { lines, netCents: net ?? null };
}

/** The one price of the lines named so (split by VAT rate, same price); null when none or several. */
function onePrice(lines: Line[], name: RegExp, unit: Line['unit']): number | null {
  const prices = new Set(
    lines
      .filter((line) => name.test(line.description) && line.unit === unit)
      .map((line) => line.price),
  );
  const [price] = prices;
  return prices.size === 1 && price !== undefined ? price : null;
}

/** A line name as a pattern matching only itself. */
const exactly = (name: string) => new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);

/** Energy line names → periods; "Simples" is the one seen on real invoices. */
const ENERGY: [RegExp, BillingPeriod][] = [
  [/^Energia Simples$/, 'simple'],
  [/^Energia Fora de Vazio$/, 'offEmpty'],
  [/^Energia Vazio$/, 'empty'],
  [/^Energia Cheias?$/, 'full'],
  [/^Energia Ponta$/, 'peak'],
];

function optionOf(periods: ReadonlySet<BillingPeriod>): TariffOption | null {
  const is = (...wanted: BillingPeriod[]) =>
    periods.size === wanted.length && wanted.every((period) => periods.has(period));
  if (is('simple')) return 'simple';
  if (is('offEmpty', 'empty')) return 'bi';
  if (is('peak', 'full', 'empty')) return 'tri';
  return null;
}

export function readRepsolInvoice(pages: readonly PageText[]): InvoiceReading {
  const text = pages.flatMap((page) => page.items.map((item) => item.str)).join(' ');
  const page = pages.find(
    (candidate) =>
      findItem(candidate, /^Período Faturação:/) &&
      candidate.items.some((item) => /^Potência Contratada/.test(normalize(item.str))),
  );
  const read = page ? readLines(page) : null;
  if (!/Repsol Portuguesa/.test(text) || !page || !read) return { ok: false, problem: 'notRepsol' };
  const { lines, netCents } = read;
  if (netCents === null || sumCents(lines.map((line) => line.cents)) !== netCents) {
    return { ok: false, problem: 'totalMismatch' };
  }

  const period = /(\d{4}-\d{2}-\d{2}) ~ (\d{4}-\d{2}-\d{2})/.exec(
    normalize(findItem(page, /^Período Faturação:/)?.str ?? ''),
  );
  if (!period?.[1] || !period[2]) return { ok: false, problem: 'notRepsol' };
  const fields: InvoiceFields = { validFrom: period[1], supplier: 'Repsol' };

  const kva = lines
    .map((line) => /^Potência Contratada \((\d+)\.(\d{2}) kVA\)$/.exec(line.description))
    .find(Boolean);
  if (kva) fields.powerVa = Number(kva[1]) * 1000 + Number(kva[2]) * 10;

  const energy: Partial<Record<BillingPeriod, number>> = {};
  for (const [name, billing] of ENERGY) {
    const price = onePrice(lines, name, 'kWh');
    if (price !== null) energy[billing] = price;
  }
  const option = optionOf(new Set(Object.keys(energy) as BillingPeriod[]));
  if (option) {
    fields.option = option;
    fields.energy = energy;
  }

  // The power term is the supplier's part plus the networks' ("Redes"): one price each.
  const powerNames = [
    ...new Set(
      lines
        .filter((line) => /Potência Contratada/.test(line.description))
        .filter((line) => !/^Desc\./.test(line.description))
        .map((line) => line.description),
    ),
  ];
  const powerPrices = powerNames.map((name) => onePrice(lines, exactly(name), 'dia'));
  if (powerPrices.length > 0 && powerPrices.every((price) => price !== null)) {
    fields.fixedPerDay = powerPrices.reduce<number>((sum, price) => sum + (price ?? 0), 0);
  }

  // Percentage discounts on energy (FE, DD, Dual…): one percentage each, added.
  const discounts = new Map<string, Set<number>>();
  for (const line of lines) {
    if (!/^Desc\. (?!Social)/.test(line.description) || line.percentBp === undefined) continue;
    if (!/Energia/.test(line.description)) continue;
    const kind = line.description.replace(/ Energia.*$/, '');
    discounts.set(kind, (discounts.get(kind) ?? new Set()).add(line.percentBp));
  }
  if ([...discounts.values()].every((values) => values.size === 1)) {
    fields.energyDiscountBp = [...discounts.values()].reduce((sum, [bp = 0]) => sum + bp, 0);
  }

  const socialEnergy = onePrice(lines, /^Desc\. Social Redes E(\.|nergia)/, 'kWh');
  const socialPower = onePrice(lines, /^Desc\. Social Redes Potência/, 'dia');
  const hasSocial = lines.some((line) => /^Desc\. Social/.test(line.description));
  if (socialEnergy !== null) fields.socialEnergyPerKwh = socialEnergy;
  else if (!hasSocial) fields.socialEnergyPerKwh = 0;
  if (socialPower !== null) fields.socialPowerPerDay = socialPower;
  else if (!hasSocial) fields.socialPowerPerDay = 0;

  const financing = onePrice(lines, /^Financ\. T\. Social/, 'kWh');
  if (financing !== null) fields.socialFinancingPerKwh = financing;

  const iecLines = lines.filter((line) => /^Imposto Especial Consumo$/.test(line.description));
  const iec = onePrice(lines, /^Imposto Especial Consumo$/, 'kWh');
  if (iec !== null) fields.iecPerKwh = iec;
  else if (iecLines.length > 0 && iecLines.every((line) => line.exempt)) fields.iecPerKwh = 0;

  const cav = onePrice(lines, /^Contribuição Audiovisual$/, 'mês');
  if (cav !== null) fields.cavPerMonth = cav;

  // DGEG: no unit price printed, one fixed amount per monthly invoice.
  const dgeg = lines.filter((line) => /^Taxa Exploração DGEG/.test(line.description));
  if (dgeg.length === 1 && dgeg[0]) fields.dgegPerMonth = centsToMicro(dgeg[0].cents);

  return { ok: true, fields, periodStart: period[1], periodEnd: period[2] };
}
