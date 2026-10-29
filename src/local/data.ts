// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The household of the local mode (docs/local-mode.md): everything the server
 * would keep for an E-Redes-only house, kept in this browser instead. Also the
 * format of the backup file, so it is validated when read back.
 */
import { z } from 'zod';
import { budgetSchema } from '../domain/budget';
import { installationSchema, UNKNOWN_INSTALLATION } from '../domain/installation';
import { tariffInputSchema, type Tariff } from '../domain/tariff';
import { lisbonDate } from '../lib/time';

/** Version of the stored data and of the backup file. */
export const LOCAL_VERSION = 1;

const int = z.number().int();

/** A quarter hour from the E-Redes file, as POST /v1/import/eredes takes it: [start, Wh, estimated]. */
const quarterSchema = z.tuple([
  int.min(946_684_800).multipleOf(900),
  int.min(0).max(20_000),
  z.union([z.literal(0), z.literal(1)]),
]);
export type LocalQuarter = z.infer<typeof quarterSchema>;

export const localDataSchema = z.object({
  version: z.literal(LOCAL_VERSION),
  /** In time order, one per start. */
  quarters: z.array(quarterSchema),
  tariffs: z.array(tariffInputSchema.and(z.object({ id: z.string() }))),
  zone: z.enum(['A', 'B', 'C']).nullable(),
  location: z
    .object({ name: z.string().min(1).max(100), latitudeCdeg: int, longitudeCdeg: int })
    .nullable(),
  budget: budgetSchema.nullable(),
  installation: installationSchema,
});
export type LocalData = z.infer<typeof localDataSchema>;

export function emptyLocalData(): LocalData {
  return {
    version: LOCAL_VERSION,
    quarters: [],
    tariffs: [],
    zone: null,
    location: null,
    budget: null,
    installation: UNKNOWN_INSTALLATION,
  };
}

/** The quarters with a batch written over them (same start: the batch wins), in time order. */
export function withQuarters(
  kept: readonly LocalQuarter[],
  batch: readonly LocalQuarter[],
): LocalQuarter[] {
  const byStart = new Map(kept.map((quarter) => [quarter[0], quarter]));
  for (const quarter of batch) byStart.set(quarter[0], quarter);
  return [...byStart.values()].sort((a, b) => a[0] - b[0]);
}

/** The quarters starting in [from, to). */
export function quartersIn(
  quarters: readonly LocalQuarter[],
  from: number,
  to: number,
): LocalQuarter[] {
  return quarters.filter(([ts]) => ts >= from && ts < to);
}

/** GET /v1/import/eredes (server/src/repo/eredes.ts, eredesSummary). */
export function importSummary(quarters: readonly LocalQuarter[]) {
  const days = new Map<string, [number, number]>();
  let energyWh = 0;
  let estimated = 0;
  for (const [ts, wh, guess] of quarters) {
    const day = lisbonDate(ts);
    const [count, guessed] = days.get(day) ?? [0, 0];
    days.set(day, [count + 1, guessed + guess]);
    energyWh += wh;
    estimated += guess;
  }
  const last = quarters.at(-1);
  return {
    quarters: quarters.length,
    estimated,
    energyWh,
    from: quarters[0]?.[0] ?? null,
    to: last ? last[0] + 900 : null,
    days: [...days].map(([day, [count, guessed]]) => [day, count, guessed]),
  };
}

/** A tariff saved as the server does: one per start date, the new one replacing it. */
export function withTariff(tariffs: readonly Tariff[], tariff: Tariff): Tariff[] {
  return [...tariffs.filter((item) => item.validFrom !== tariff.validFrom), tariff].sort((a, b) =>
    a.validFrom.localeCompare(b.validFrom),
  );
}
