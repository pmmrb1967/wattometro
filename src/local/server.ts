// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The API of the local mode (docs/local-mode.md), answered in the browser from
 * the household kept in IndexedDB (store.ts): the same routes and response
 * shapes as server/src/app.ts for a house with the E-Redes file and no Shelly,
 * so the pages and src/app/api.ts work unchanged. Nothing is sent to the
 * server. Without VAPID keys or AI_KEY_SECRET, as a server lacking them: no
 * alerts, and the AI key stays in this browser (src/ai/settings.ts).
 */
import { z } from 'zod';
import { budgetSchema } from '../domain/budget';
import { installationSchema } from '../domain/installation';
import { tariffInputSchema } from '../domain/tariff';
import { dailyEnergy, empty, energyRecords, invalid, json } from '../demo/responses';
import { t } from '../i18n/pt-PT';
import { lisbonDate, startOfLisbonDay } from '../lib/time';
import {
  emptyLocalData,
  importSummary,
  quartersIn,
  withQuarters,
  withTariff,
  type LocalData,
} from './data';
import { browserStore, type LocalStore } from './store';

const EREDES = 'eredes';
/** As the server: a batch is at most 3000 quarters (server/src/app.ts, ImportBody). */
const MAX_IMPORT_QUARTERS = 3000;

export const LOCAL_ME = {
  email: t.local.who,
  householdId: 'local',
  householdName: t.local.householdName,
  admin: false,
};

const ImportBody = z.object({
  quarters: z
    .array(
      z.tuple([
        z.number().int().min(946_684_800).multipleOf(900),
        z.number().int().min(0).max(20_000),
        z.union([z.literal(0), z.literal(1)]),
      ]),
    )
    .min(1)
    .max(MAX_IMPORT_QUARTERS),
});

const LocationBody = z.object({
  location: z
    .object({
      name: z.string().trim().min(1).max(100),
      latitudeCdeg: z.number().int(),
      longitudeCdeg: z.number().int(),
    })
    .nullable(),
});

const numberParam = (url: URL, name: string) => {
  const value = Number(url.searchParams.get(name));
  return url.searchParams.has(name) && Number.isInteger(value) ? value : null;
};

/** The browser refused to keep it (full, private window): as a server failing. */
const notKept = () => json({ error: 'storage' }, 507);

export function createLocalServer(store: LocalStore, clock = () => Date.now() / 1000) {
  let data: LocalData | null = null;

  async function household(): Promise<LocalData> {
    data ??= (await store.load()) ?? emptyLocalData();
    return data;
  }

  async function keep(next: LocalData): Promise<Response> {
    if (!(await store.save(next))) return notKept();
    data = next;
    return empty();
  }

  async function respond(method: string, path: string, body?: unknown): Promise<Response> {
    const url = new URL(path, 'https://local.invalid');
    const route = `${method} ${url.pathname}`;
    const house = await household();
    const from = numberParam(url, 'from');
    const to = numberParam(url, 'to');
    const range = from !== null && to !== null && from < to;

    switch (route) {
      case 'GET /v1/auth/me':
        return json(LOCAL_ME);
      case 'POST /v1/auth/logout':
      case 'POST /v1/visit':
        return empty();
      case 'GET /v1/push/key':
      case 'GET /v1/push/subscription':
      case 'PUT /v1/push/subscription':
      case 'DELETE /v1/push/subscription':
      case 'POST /v1/push/test':
      case 'GET /v1/ai-settings':
      case 'PUT /v1/ai-settings':
      case 'DELETE /v1/ai-settings':
        return json({ error: 'not_configured' }, 503);
      case 'GET /v1/devices':
        return json({ devices: [] });
      case 'GET /v1/now': {
        const now = Math.floor(clock());
        return json({
          now,
          dayStart: startOfLisbonDay(lisbonDate(now)),
          meters: [],
          database: { sizeBytes: null, limitBytes: 0, rowsReadToday: 0, rowsReadLimit: 0 },
        });
      }
      case 'GET /v1/energy': {
        if (!range) return invalid();
        const quarters = quartersIn(house.quarters, from, to);
        return json({
          meters:
            quarters.length === 0
              ? []
              : [
                  {
                    meter: EREDES,
                    days: dailyEnergy(quarters).length,
                    energyWh: quarters.reduce((sum, [, wh]) => sum + wh, 0),
                  },
                ],
        });
      }
      case 'GET /v1/energy/days':
      case 'GET /v1/energy/quarters': {
        if (!range || url.searchParams.get('meter') !== EREDES) return invalid();
        const quarters = quartersIn(house.quarters, from, to);
        return route === 'GET /v1/energy/days'
          ? json({ days: dailyEnergy(quarters) })
          : energyRecords(quarters);
      }
      case 'GET /v1/import/eredes':
        return json(importSummary(house.quarters));
      case 'POST /v1/import/eredes': {
        const parsed = ImportBody.safeParse(body);
        if (!parsed.success) return invalid();
        const { quarters } = parsed.data;
        // Nothing from the future.
        if (quarters.some(([ts]) => ts > clock())) return invalid();
        const saved = await keep({ ...house, quarters: withQuarters(house.quarters, quarters) });
        return saved.ok ? json({ written: quarters.length }) : saved;
      }
      case 'DELETE /v1/import/eredes':
        return keep({ ...house, quarters: [] });
      case 'GET /v1/tariffs':
        return json({ tariffs: house.tariffs });
      case 'POST /v1/tariffs': {
        const parsed = tariffInputSchema.safeParse(body);
        if (!parsed.success) return invalid();
        const tariff = { ...parsed.data, id: `local-${parsed.data.validFrom}` };
        const saved = await keep({ ...house, tariffs: withTariff(house.tariffs, tariff) });
        return saved.ok ? json({ tariff }, 201) : saved;
      }
      case 'GET /v1/omie':
        // Tomorrow's prices are read by the server's Cron; the offers keep the file's.
        return json({ days: [] });
      case 'GET /v1/quality':
        return json({
          zone: house.zone,
          devices: [],
          intervals: [],
          outside: [],
          outsideTruncated: false,
        });
      case 'PUT /v1/quality/zone': {
        const zone = (body as { zone?: unknown } | undefined)?.zone;
        if (zone !== null && zone !== 'A' && zone !== 'B' && zone !== 'C') return invalid();
        return keep({ ...house, zone });
      }
      case 'GET /v1/household/location':
        return json({ location: house.location });
      case 'PUT /v1/household/location': {
        const parsed = LocationBody.safeParse(body);
        return parsed.success ? keep({ ...house, location: parsed.data.location }) : invalid();
      }
      case 'GET /v1/household/budget':
        return json({ budget: house.budget });
      case 'PUT /v1/household/budget': {
        const parsed = budgetSchema
          .nullable()
          .safeParse((body as { budget?: unknown } | undefined)?.budget);
        return parsed.success ? keep({ ...house, budget: parsed.data }) : invalid();
      }
      case 'GET /v1/household/installation':
        return json({ installation: house.installation });
      case 'PUT /v1/household/installation': {
        const parsed = installationSchema.safeParse(
          (body as { installation?: unknown } | undefined)?.installation,
        );
        return parsed.success ? keep({ ...house, installation: parsed.data }) : invalid();
      }
      case 'GET /v1/power': {
        if (!range) return invalid();
        const quarters = quartersIn(house.quarters, from, to);
        return json({
          devices: [],
          meters: [],
          days: [],
          eredes: {
            quarters: quarters.length,
            maxEnergyWh: quarters.reduce<number | null>(
              (max, [, wh]) => Math.max(max ?? 0, wh),
              null,
            ),
          },
        });
      }
      // What only a Shelly gives: nothing.
      case 'GET /v1/outages':
        return json({ outages: [] });
      case 'GET /v1/signatures':
        return json({ signatures: [] });
      case 'GET /v1/appliances':
        return json({ appliances: [] });
      case 'GET /v1/nilm/days':
        return json({ days: [] });
    }

    const tariff = /^\/v1\/tariffs\/([^/]+)$/.exec(url.pathname);
    if (method === 'DELETE' && tariff) {
      const id = decodeURIComponent(tariff[1] as string);
      return keep({ ...house, tariffs: house.tariffs.filter((item) => item.id !== id) });
    }
    return json({ error: 'not_found' }, 404);
  }

  return {
    respond,
    /** Forgets what was read, so the next request reads the store again (after a restore). */
    reload: () => {
      data = null;
    },
  };
}

const server = createLocalServer(browserStore);

/** Answers one API request of the local mode. */
export const localResponse = server.respond;
export const reloadLocal = server.reload;
