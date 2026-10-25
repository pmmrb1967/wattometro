// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Evaluation of "Pergunta ao Wattómetro" (src/ai/chat.ts) on the real E-Redes
 * export in fixtures/private (never committed), with the tariff of the last
 * invoice in fixtures/private/repsol-electricity-invoices.json and the ERSE
 * offers in public/data/erse-offers.json.
 *
 *   pnpm ai:eval [model]        (default: the app's default model)
 *   pnpm ai:eval --dry          (no API: runs the tools and prints what must be quoted)
 *
 * Reads ANTHROPIC_API_KEY from .env and spends real money (the cost is printed
 * at the end). Each question must be answered with the expected tool, quote
 * its key numbers, and contain no quantity the tools did not give. Prints to
 * the terminal only; the answers sent to Anthropic hold only the tools'
 * summaries (CLAUDE.md, "IA").
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { AnthropicProvider } from '../src/ai/anthropic';
import { askWattometro } from '../src/ai/chat';
import { DEFAULT_AI_MODEL, findModel, formatMicroUsd } from '../src/ai/models';
import { AiError, type ToolCall } from '../src/ai/provider';
import { AI_TOOLS } from '../src/ai/tools';
import { runTool, type ToolContext } from '../src/ai/tools/tool';
import { canonicalNumbers } from '../src/ai/verify';
import { offersFileSchema } from '../src/domain/erse';
import { tariffInputSchema } from '../src/domain/tariff';
import { parseEredesXlsx } from '../src/import/eredes';
import { lisbonDate, lisbonToday, startOfLisbonDay } from '../src/lib/time';
import { parseEnv } from './shelly/rpc';

const PRIVATE = resolve('fixtures', 'private');
const DAY = 86_400;

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

const env = existsSync('.env') ? parseEnv(readFileSync('.env', 'utf8')) : {};
const args = process.argv.slice(2);
const dry = args.includes('--dry');
const model = args.find((arg) => !arg.startsWith('--')) ?? DEFAULT_AI_MODEL;
if (!findModel(model)) fail(`Unknown model ${model}`);

const exportName = existsSync(PRIVATE)
  ? readdirSync(PRIVATE).find((name) => /^Consumos_.*\.xlsx$/.test(name))
  : undefined;
if (!exportName) fail('No E-Redes export (Consumos_*.xlsx) in fixtures/private');
const parsed = parseEredesXlsx(new Uint8Array(readFileSync(join(PRIVATE, exportName))));
if (!parsed.ok) fail(`E-Redes export: ${parsed.error}`);
const quarters = parsed.quarters;

const invoicesPath = join(PRIVATE, 'repsol-electricity-invoices.json');
if (!existsSync(invoicesPath)) fail('No fixtures/private/repsol-electricity-invoices.json');
const invoices = (
  JSON.parse(readFileSync(invoicesPath, 'utf8')) as { invoices: { tariff: unknown }[] }
).invoices;
const tariffInput = tariffInputSchema.parse(invoices.at(-1)?.tariff);
// From the first quarter, so every month of the export has a tariff.
const firstDay = lisbonDate(quarters[0]!.ts);
const tariffs = [{ ...tariffInput, id: 'eval', validFrom: firstDay }];

const offersFile = offersFileSchema.parse(
  JSON.parse(readFileSync(resolve('public', 'data', 'erse-offers.json'), 'utf8')),
);

// "Today" is the day after the export's last quarter, as if it had just been imported.
const lastTs = quarters.at(-1)!.ts;
const today = lisbonDate(lastTs + DAY);
const maxQuarterWh = quarters.reduce((max, { energyWh }) => Math.max(max, energyWh), 0);
const context: ToolContext = {
  today,
  quarters,
  yearFrom: startOfLisbonDay(lisbonDate(lastTs - 365 * DAY)),
  tariffs,
  daily: null, // the house's heating is not electric
  offers: async () => offersFile.offers,
  power: async () => ({ kind: 'eredes', maxQuarterW: maxQuarterWh * 4 }),
  quality: async () => null,
};

/** The month before "today". */
const lastMonth = (() => {
  const [year, month] = today.split('-').map(Number) as [number, number];
  return month === 1 ? `${year - 1}-12` : `${year}-${String(month - 1).padStart(2, '0')}`;
})();
const MONTHS = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];

interface Case {
  question: string;
  tool: string;
  /** Extra condition on the call's input (e.g. the month asked about). */
  input?: (input: Record<string, unknown>) => boolean;
  /** Values of the tool's result the answer must quote. */
  quote: (result: Record<string, unknown>) => unknown[];
}

const get = (value: unknown, ...path: string[]): unknown =>
  path.reduce<unknown>(
    (item, key) =>
      item && typeof item === 'object' ? (item as Record<string, unknown>)[key] : undefined,
    value,
  );

const CASES: Case[] = [
  {
    question: `Quanto gastei em ${MONTHS[Number(lastMonth.slice(5)) - 1]}?`,
    tool: 'get_cost_breakdown',
    input: (input) => input.month === lastMonth,
    quote: (result) => [get(result, 'cost', 'total')],
  },
  {
    question: 'Compensa-me o bi-horário?',
    tool: 'simulate_tariffs',
    quote: (result) => [
      get(result, 'current', 'perYear'),
      get(result, 'cheapestByOption', 'bi', 'perYear'),
    ],
  },
  {
    question: 'Quanto me custa o consumo fantasma por ano?',
    tool: 'get_baseload',
    quote: (result) => [get(result, 'power'), get(result, 'perYear', 'cost')],
  },
  {
    question: 'Que potência devo contratar?',
    tool: 'recommend_contracted_power',
    quote: (result) => [get(result, 'highestQuarterAverage')],
  },
  {
    question: 'Quanto vou pagar de eletricidade este mês?',
    tool: 'forecast_month_bill',
    quote: (result) => [get(result, 'forecast')],
  },
  {
    question: 'Houve algum dia estranho nos últimos meses?',
    tool: 'get_anomalies',
    quote: (result) => {
      const first = (get(result, 'list') as unknown[] | undefined)?.[0];
      return first ? [get(first, 'used')] : [];
    },
  },
];

/** The answer quotes the value: every number in it appears in the answer (separators aside). */
function quotes(text: string, value: unknown): boolean {
  if (typeof value !== 'string' && typeof value !== 'number') return false;
  const inAnswer = new Set(canonicalNumbers(text));
  const wanted = canonicalNumbers(String(value));
  return wanted.length > 0 && wanted.every((number) => inAnswer.has(number));
}

if (dry) {
  for (const item of CASES) {
    const input = item.tool === 'get_cost_breakdown' ? { month: lastMonth } : {};
    const outcome = await runTool(AI_TOOLS, item.tool, input, context);
    const values = outcome.ok ? item.quote(outcome.result as Record<string, unknown>) : [];
    console.log(`${item.question}
      ${item.tool}: ${outcome.ok ? JSON.stringify(values) : outcome.error}`);
  }
  process.exit(0);
}

const apiKey = env.ANTHROPIC_API_KEY || fail('Set ANTHROPIC_API_KEY in .env (see .env.example).');
const provider = new AnthropicProvider({ apiKey, model });
console.log(
  `${model}; ${quarters.length} quarter hours, ${firstDay} to ${lisbonDate(lastTs)}; today = ${today}\n`,
);

let spent = 0;
let passed = 0;
for (const item of CASES) {
  const problems: string[] = [];
  let calls: ToolCall[] = [];
  let text = '';
  try {
    const result = await askWattometro(provider, context, [], item.question);
    spent += result.usage.reduce((sum, usage) => sum + usage.costMicroUsd, 0);
    ({ calls, text } = result);
    const call = calls.find(
      (candidate) =>
        candidate.name === item.tool &&
        candidate.outcome.ok &&
        (!item.input || item.input(candidate.input as Record<string, unknown>)),
    );
    if (!call || !call.outcome.ok) problems.push(`${item.tool} not called as expected`);
    else {
      for (const value of item.quote(call.outcome.result as Record<string, unknown>)) {
        if (!quotes(text, value)) problems.push(`does not quote ${JSON.stringify(value)}`);
      }
    }
    if (result.unconfirmed.length > 0)
      problems.push(`not from the tools: ${result.unconfirmed.join(', ')}`);
  } catch (error) {
    if (error instanceof AiError)
      spent += error.usage.reduce((sum, usage) => sum + usage.costMicroUsd, 0);
    problems.push(`failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (problems.length === 0) passed++;
  console.log(`${problems.length === 0 ? 'PASS' : 'FAIL'}  ${item.question}`);
  console.log(`      tools: ${calls.map((call) => call.name).join(', ') || '—'}`);
  for (const problem of problems) console.log(`      ${problem}`);
  if (text) console.log(text.replace(/^/gm, '      │ '));
  console.log();
}

console.log(
  `${passed}/${CASES.length} passed; cost ≈ ${formatMicroUsd(spent)} (on ${lisbonToday()})`,
);
process.exit(passed === CASES.length ? 0 : 1);
