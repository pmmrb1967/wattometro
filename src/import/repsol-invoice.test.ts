// SPDX-License-Identifier: AGPL-3.0-or-later
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { PageText, TextItem } from '../pdf/text';
import { readRepsolInvoice } from './repsol-invoice';

/** A synthetic invoice page laid out as the real ones (docs/repsol-invoice.md): x per column. */
function page(lines: string[][], net = '30,19€'): PageText {
  const items: TextItem[] = [];
  const add = (str: string, x: number, y: number) =>
    items.push({ str, x, y, width: 10, height: 8, fontName: 'f' });
  add('Repsol Portuguesa, Lda.', 10, 542);
  add('Período Faturação: 2026-05-22 ~ 2026-06-21', 436, 75);
  add('Descrição', 39, 154);
  add('Explicação de valores', 285, 154);
  add('Valor(€)', 423, 154);
  lines.forEach(([description = '', explanation = '', value = ''], index) => {
    const y = 174 + index * 8;
    add(description, 53, y);
    if (explanation) add(explanation, 285, y);
    if (value) add(value, 433, y);
  });
  add('Total sem IVA', 41, 351);
  add(net, 432, 351);
  return { page: 2, width: 595, height: 842, items };
}

// Invented quantities and supplier prices (the social and tax values are the regulated ones).
const SIMPLE = [
  ['Energia Simples', '50 kWh x 0,160000 €/kWh', '8,00'],
  ['Desc. FE Energia Simples', '30d/30d x (8,00 € x 1,00%)', '-0,08'],
  ['Desc. DD Energia Simples', '30d/30d x (8,00 € x 1,00%)', '-0,08'],
  ['Desc. Dual Energia Simples', '30d/30d x (8,00 € x 2,00%)', '-0,16'],
  ['Energia Simples', '150 kWh x 0,160000 €/kWh', '24,00'],
  ['Desc. FE Energia Simples', '30d/30d x (24,00 € x 1,00%)', '-0,24'],
  ['Desc. DD Energia Simples', '30d/30d x (24,00 € x 1,00%)', '-0,24'],
  ['Desc. Dual Energia Simples', '30d/30d x (24,00 € x 2,00%)', '-0,48'],
  ['Desc. Social Redes E. Simples', '50 kWh x -0,046800 €/kWh', '-2,34'],
  ['Desc. Social Redes E. Simples', '150 kWh x -0,046800 €/kWh', '-7,02'],
  ['Potência Contratada (6.90 kVA)', '30 dias x 0,100000 €/dia', '3,00'],
  ['Redes Potência Contratada', '30 dias x 0,300000 €/dia', '9,00'],
  ['Desc. Social Redes Potência', '30 dias x -0,216600 €/dia', '-6,50'],
  ['Financ. T. Social (Dir. ERSE 3-4/2024)', '50 kWh x 0,002067 €/kWh', '0,10'],
  ['Financ. T. Social (Dir. ERSE 3-4/2024)', '150 kWh x 0,002067 €/kWh', '0,31'],
  ['Taxas e Impostos'],
  ['Contribuição Audiovisual', '1,000000 meses x 2,850000 €/mês', '2,85'],
  ['Taxa Exploração DGEG (DL-4/93)', '', '0,07'],
  ['Imposto Especial Consumo', 'Isen. Imposto Especial Consumo', '0,00'],
  ['(c) IVA 23%', '10,0000 € x 23,00%', '2,30'],
];

describe('readRepsolInvoice', () => {
  it('fills the tariff form from the invoice lines', () => {
    expect(readRepsolInvoice([page(SIMPLE)])).toEqual({
      ok: true,
      periodStart: '2026-05-22',
      periodEnd: '2026-06-21',
      fields: {
        validFrom: '2026-05-22',
        supplier: 'Repsol',
        powerVa: 6900,
        option: 'simple',
        energy: { simple: 160_000 },
        // The supplier's power term plus the networks'.
        fixedPerDay: 400_000,
        // FE 1 % + DD 1 % + Dual 2 %.
        energyDiscountBp: 400,
        socialEnergyPerKwh: 46_800,
        socialPowerPerDay: 216_600,
        socialFinancingPerKwh: 2_067,
        iecPerKwh: 0,
        cavPerMonth: 2_850_000,
        dgegPerMonth: 70_000,
      },
    });
  });

  it('leaves a price out when it does not give its line amount', () => {
    const wrong = SIMPLE.map((line) =>
      line[0] === 'Redes Potência Contratada'
        ? [line[0], '30 dias x 0,300000 €/dia', '8,00']
        : line,
    );
    const reading = readRepsolInvoice([page(wrong, '29,19€')]);
    expect(reading.ok && reading.fields.fixedPerDay).toBeUndefined();
    expect(reading.ok && reading.fields.energy).toEqual({ simple: 160_000 });
  });

  it('trusts nothing when the lines do not add up to the total', () => {
    expect(readRepsolInvoice([page(SIMPLE, '31,00€')])).toEqual({
      ok: false,
      problem: 'totalMismatch',
    });
  });

  it('says so when it is not a Repsol electricity invoice', () => {
    const other = page(SIMPLE);
    other.items = other.items.filter((item) => !item.str.startsWith('Repsol'));
    expect(readRepsolInvoice([other])).toEqual({ ok: false, problem: 'notRepsol' });
  });

  it('sets no social discount to 0 only when the invoice has none', () => {
    const without = SIMPLE.filter((line) => !line[0]?.startsWith('Desc. Social'));
    const reading = readRepsolInvoice([page(without, '46,05€')]);
    expect(reading.ok && reading.fields.socialEnergyPerKwh).toBe(0);
    expect(reading.ok && reading.fields.socialPowerPerDay).toBe(0);
  });
});

// Real invoices (fixtures/private, local only; the PDFs ask for a password,
// given in REPSOL_PDF_PASSWORD): the form gets what was copied by hand.
const PRIVATE = join(__dirname, '..', '..', 'fixtures', 'private');
const EXPECTED = join(PRIVATE, 'repsol-electricity-invoices.json');
const password = process.env.REPSOL_PDF_PASSWORD;
const real =
  password && existsSync(EXPECTED)
    ? (
        JSON.parse(readFileSync(EXPECTED, 'utf8')) as {
          invoices: { file: string; period: string; tariff: Record<string, unknown> }[];
        }
      ).invoices.filter((invoice) => existsSync(join(PRIVATE, invoice.file)))
    : [];

describe.skipIf(real.length === 0)('readRepsolInvoice on the real invoices', () => {
  it.each(real)('$file', async ({ file, period, tariff }) => {
    const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const { extractText } = await import('../pdf/text');
    const data = new Uint8Array(readFileSync(join(PRIVATE, file)));
    const task = getDocument({ data, password });
    const reading = readRepsolInvoice(await extractText(await task.promise));
    await task.destroy();
    const [from] = period.split('..');
    // The invoice does not state these; the form keeps its own.
    const fromInvoice = { ...tariff };
    for (const key of ['cycle', 'periodsMap', 'largeFamily']) delete fromInvoice[key];
    expect(reading).toMatchObject({ ok: true, periodStart: from });
    expect(reading.ok && reading.fields).toEqual({ ...fromInvoice, validFrom: from });
  });
});
