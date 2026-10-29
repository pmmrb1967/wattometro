// SPDX-License-Identifier: AGPL-3.0-or-later
/** Calls to the project's API, same-origin under /v1. Every response is validated with zod. */
import { z } from 'zod';
import { isDemo } from '../demo/mode';
import { demoResponse } from '../demo/server';
import { isLocal } from '../local/mode';
import { localResponse } from '../local/server';
import { parsePvgis, type SolarYear } from '../domain/solar';
import { OFFERS_URL, offersFileSchema, type OffersFile } from '../domain/erse';
import { OMIE_URL, omieFileSchema, type OmieFile } from '../domain/omie';
import { tariffInputSchema, type Tariff, type TariffInput } from '../domain/tariff';
import { budgetSchema, type Budget } from '../domain/budget';
import type { VisitPage } from '../lib/pages';
import { installationSchema, type Installation } from '../domain/installation';

const Health = z.object({
  status: z.enum(['ok', 'degraded']),
  database: z.boolean(),
  /** Past D1's daily limit: when it resets (midnight UTC). */
  limit: z.object({ resetsAt: z.number().int() }).optional(),
});
export type Health = z.infer<typeof Health>;

const Device = z.object({
  id: z.string(),
  name: z.string(),
  model: z.string().nullable(),
  firmware: z.string().nullable(),
  scriptVersion: z.string().nullable(),
  createdAt: z.number().int(),
  lastSeenAt: z.number().int().nullable(),
});
export type Device = z.infer<typeof Device>;

const Minute = z.object({
  ts: z.number().int(),
  powerAvgW: z.number().int(),
  powerMinW: z.number().int(),
  powerMaxW: z.number().int(),
  voltageAvgDv: z.number().int(),
  voltageMinDv: z.number().int(),
  voltageMaxDv: z.number().int(),
  pfAvgPct: z.number().int(),
});

const Now = z.object({
  now: z.number().int(),
  dayStart: z.number().int(),
  meters: z.array(
    z.object({
      deviceId: z.string(),
      deviceName: z.string(),
      channel: z.number().int(),
      lastSeenAt: z.number().int().nullable(),
      latest: Minute.nullable(),
      today: z.object({
        minutes: z.number().int(),
        energyWh: z.number().int(),
        powerMaxW: z.number().int().nullable(),
        quarters: z.array(z.object({ ts: z.number().int(), energyWh: z.number().int() })),
      }),
    }),
  ),
  database: z.object({
    sizeBytes: z.number().int().nullable(),
    limitBytes: z.number().int(),
    // Absent from a server older than the app.
    rowsReadToday: z.number().int().default(0),
    rowsReadLimit: z.number().int().default(5_000_000),
  }),
});
export type Now = z.infer<typeof Now>;
export type Meter = Now['meters'][number];

const Me = z.object({
  email: z.string(),
  householdId: z.string(),
  householdName: z.string(),
  // Absent from a server older than the app: not an administrator.
  admin: z.boolean().default(false),
});
export type Me = z.infer<typeof Me>;

/** Reasons a request can fail that the user can act on. */
export type Failure =
  | { ok: false; reason: 'invalid' | 'unavailable' | 'unauthenticated' }
  /** Not possible in the demonstration (the account and devices stay as they are). */
  | { ok: false; reason: 'demo' }
  | { ok: false; reason: 'locked'; retryAfter: number };

const Locked = z.object({ retryAfter: z.number().int() });

async function send(method: string, path: string, body?: unknown): Promise<Response | null> {
  // The demonstration answers in the browser; nothing goes to the server.
  if (isDemo()) return demoResponse(method, path, body);
  // The local mode too: its household is kept in this browser (src/local/).
  if (isLocal()) return localResponse(method, path, body);
  try {
    return await fetch(path, {
      method,
      ...(body !== undefined
        ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
        : {}),
    });
  } catch {
    return null;
  }
}

/** Maps an unsuccessful response; `invalidStatuses` are the user's mistakes for this call. */
async function failure(response: Response | null, invalidStatuses: number[]): Promise<Failure> {
  if (!response) return { ok: false, reason: 'unavailable' };
  if (response.status === 409 && isDemo()) return { ok: false, reason: 'demo' };
  if (invalidStatuses.includes(response.status)) return { ok: false, reason: 'invalid' };
  if (response.status === 401) return { ok: false, reason: 'unauthenticated' };
  if (response.status === 429) {
    const locked = Locked.safeParse(await response.json().catch(() => null));
    return {
      ok: false,
      reason: 'locked',
      retryAfter: locked.success ? locked.data.retryAfter : 900,
    };
  }
  return { ok: false, reason: 'unavailable' };
}

export async function fetchHealth(signal?: AbortSignal): Promise<Health> {
  const response = await fetch('/v1/health', { signal });
  return Health.parse(await response.json());
}

/** The signed-in user, or null without a valid session. */
export async function fetchMe(signal?: AbortSignal): Promise<Me | null> {
  const response = isDemo()
    ? demoResponse('GET', '/v1/auth/me')
    : isLocal()
      ? await localResponse('GET', '/v1/auth/me')
      : await fetch('/v1/auth/me', { signal });
  if (response.status === 401) return null;
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return Me.parse(await response.json());
}

export async function login(
  email: string,
  password: string,
): Promise<{ ok: true; me: Me } | Failure> {
  const response = await send('POST', '/v1/auth/login', { email, password });
  if (response?.ok) return { ok: true, me: Me.parse(await response.json()) };
  return failure(response, [400, 401]);
}

export async function logout(): Promise<void> {
  await send('POST', '/v1/auth/logout');
}

/** 'invalid' means the current password is wrong. */
export async function changePassword(
  currentPassword: string,
  newPassword: string,
): Promise<{ ok: true } | Failure> {
  const response = await send('POST', '/v1/account/password', { currentPassword, newPassword });
  if (response?.ok) return { ok: true };
  return failure(response, [403]);
}

export async function renameHousehold(name: string): Promise<{ ok: true; me: Me } | Failure> {
  const response = await send('PUT', '/v1/household', { name });
  if (response?.ok) return { ok: true, me: Me.parse(await response.json()) };
  return failure(response, [400]);
}

export async function fetchDevices(): Promise<{ ok: true; devices: Device[] } | Failure> {
  const response = await send('GET', '/v1/devices');
  if (response?.ok) {
    return {
      ok: true,
      devices: z.object({ devices: z.array(Device) }).parse(await response.json()).devices,
    };
  }
  return failure(response, []);
}

/** The token comes only in this response: the server keeps just its hash. */
export async function createDevice(
  name: string,
): Promise<{ ok: true; device: Device; token: string } | Failure> {
  const response = await send('POST', '/v1/devices', { name });
  if (response?.ok) {
    const created = z.object({ device: Device, token: z.string() }).parse(await response.json());
    return { ok: true, ...created };
  }
  return failure(response, [400]);
}

export async function renameDevice(id: string, name: string): Promise<{ ok: true } | Failure> {
  const response = await send('PUT', `/v1/devices/${encodeURIComponent(id)}`, { name });
  if (response?.ok) return { ok: true };
  return failure(response, [400]);
}

export async function revokeDevice(id: string): Promise<{ ok: true } | Failure> {
  const response = await send('DELETE', `/v1/devices/${encodeURIComponent(id)}`);
  if (response?.ok) return { ok: true };
  return failure(response, []);
}

/** The latest minute and today so far, per meter (GET /v1/now). */
export async function fetchNow(): Promise<{ ok: true; now: Now } | Failure> {
  const response = await send('GET', '/v1/now');
  if (response?.ok) return { ok: true, now: Now.parse(await response.json()) };
  return failure(response, []);
}

const TariffResponse = tariffInputSchema.and(z.object({ id: z.string() }));

/** The household's contracts, oldest first. */
export async function fetchTariffs(): Promise<{ ok: true; tariffs: Tariff[] } | Failure> {
  const response = await send('GET', '/v1/tariffs');
  if (response?.ok) {
    const { tariffs } = z.object({ tariffs: z.array(TariffResponse) }).parse(await response.json());
    return { ok: true, tariffs };
  }
  return failure(response, []);
}

/** A contract starting on the same day as an existing one replaces it. */
export async function saveTariff(
  input: TariffInput,
): Promise<{ ok: true; tariff: Tariff } | Failure> {
  const response = await send('POST', '/v1/tariffs', input);
  if (response?.ok) {
    return {
      ok: true,
      tariff: z.object({ tariff: TariffResponse }).parse(await response.json()).tariff,
    };
  }
  return failure(response, [400]);
}

export async function deleteTariff(id: string): Promise<{ ok: true } | Failure> {
  const response = await send('DELETE', `/v1/tariffs/${encodeURIComponent(id)}`);
  if (response?.ok) return { ok: true };
  return failure(response, []);
}

const int = z.number().int();
const Zone = z.enum(['A', 'B', 'C']);

const Quality = z.object({
  zone: Zone.nullable(),
  devices: z.array(z.object({ id: z.string(), name: z.string() })),
  /** [ts, minutes, avgDv, minDv, maxDv] per 10 minutes. */
  intervals: z.array(
    z.object({ meter: z.string(), intervals: z.array(z.tuple([int, int, int, int, int])) }),
  ),
  /** [ts, minDv, maxDv] of the minutes outside the band. */
  outside: z.array(z.object({ meter: z.string(), minutes: z.array(z.tuple([int, int, int])) })),
  outsideTruncated: z.boolean(),
});
export type Quality = z.infer<typeof Quality>;

/** Voltage of [from, to) (at most 93 days); `low`/`high`: the band, in dV. */
export async function fetchQuality(
  from: number,
  to: number,
  low: number,
  high: number,
): Promise<{ ok: true; quality: Quality } | Failure> {
  const query = new URLSearchParams({
    from: String(from),
    to: String(to),
    low: String(low),
    high: String(high),
  });
  const response = await send('GET', `/v1/quality?${query}`);
  if (response?.ok) return { ok: true, quality: Quality.parse(await response.json()) };
  return failure(response, []);
}

export async function saveQualityZone(
  zone: z.infer<typeof Zone> | null,
): Promise<{ ok: true } | Failure> {
  const response = await send('PUT', '/v1/quality/zone', { zone });
  if (response?.ok) return { ok: true };
  return failure(response, [400]);
}

const HouseholdLocation = z.object({
  name: z.string(),
  /** Hundredths of a degree (docs/open-meteo.md). */
  latitudeCdeg: int,
  longitudeCdeg: int,
});
export type HouseholdLocation = z.infer<typeof HouseholdLocation>;

/** The locality of the house, for the weather; null until one is chosen. */
export async function fetchHouseholdLocation(): Promise<
  { ok: true; location: HouseholdLocation | null } | Failure
> {
  const response = await send('GET', '/v1/household/location');
  if (response?.ok) {
    const parsed = z
      .object({ location: HouseholdLocation.nullable() })
      .parse(await response.json());
    return { ok: true, location: parsed.location };
  }
  return failure(response, []);
}

export async function saveHouseholdLocation(
  location: HouseholdLocation | null,
): Promise<{ ok: true } | Failure> {
  const response = await send('PUT', '/v1/household/location', { location });
  if (response?.ok) return { ok: true };
  return failure(response, [400]);
}

/** One more visit to a page, for the administrator's panel; failures do not matter. */
export async function recordVisit(page: VisitPage): Promise<void> {
  await send('POST', '/v1/visit', { page });
}

const AdminStats = z.object({
  now: int,
  limits: z.object({ rowsRead: int, rowsWritten: int, databaseBytes: int }),
  days: z.array(z.object({ day: z.string(), rowsRead: int, rowsWritten: int })),
  databaseBytes: int.nullable(),
  cron: z.object({ rolledUpUntil: int.nullable(), purgedAt: int.nullable() }),
  accounts: z.object({ users: int, households: int, pushDevices: int }),
  devices: z.array(
    z.object({
      model: z.string().nullable(),
      scriptVersion: z.string().nullable(),
      lastSeenAt: int.nullable(),
      minutesToday: int,
      expectedToday: int,
    }),
  ),
  visits: z.object({
    days: int,
    pages: z.array(z.object({ page: z.string(), today: int, total: int })),
  }),
});
export type AdminStats = z.infer<typeof AdminStats>;

/** The server's totals (administrators only; others get 403). */
export async function fetchAdminStats(): Promise<{ ok: true; stats: AdminStats } | Failure> {
  const response = await send('GET', '/v1/admin/stats');
  if (response?.ok) return { ok: true, stats: AdminStats.parse(await response.json()) };
  return failure(response, [403]);
}

/** The month's budget (Consumo › Previsão); null without one. */
export async function fetchBudget(): Promise<{ ok: true; budget: Budget | null } | Failure> {
  const response = await send('GET', '/v1/household/budget');
  if (response?.ok) {
    const parsed = z.object({ budget: budgetSchema.nullable() }).parse(await response.json());
    return { ok: true, budget: parsed.budget };
  }
  return failure(response, []);
}

export async function saveBudget(budget: Budget | null): Promise<{ ok: true } | Failure> {
  const response = await send('PUT', '/v1/household/budget', { budget });
  if (response?.ok) return { ok: true };
  return failure(response, [400]);
}

/** What the household said about its installation; every answer null until saved. */
export async function fetchHouseholdInstallation(): Promise<
  { ok: true; installation: Installation } | Failure
> {
  const response = await send('GET', '/v1/household/installation');
  if (response?.ok) {
    const parsed = z.object({ installation: installationSchema }).parse(await response.json());
    return { ok: true, installation: parsed.installation };
  }
  return failure(response, []);
}

export async function saveHouseholdInstallation(
  installation: Installation,
): Promise<{ ok: true } | Failure> {
  const response = await send('PUT', '/v1/household/installation', { installation });
  if (response?.ok) return { ok: true };
  return failure(response, [400]);
}

const Boot = z.object({
  deviceId: z.string(),
  bootAt: int,
  startAt: int.nullable(),
  excluded: z.boolean(),
});
export type Boot = z.infer<typeof Boot>;

/** Shelly boots in [from, to) (at most 400 days): src/domain/voltage.ts turns them into outages. */
export async function fetchBoots(
  from: number,
  to: number,
): Promise<{ ok: true; boots: Boot[] } | Failure> {
  const response = await send('GET', `/v1/outages?from=${from}&to=${to}`);
  if (response?.ok) {
    return {
      ok: true,
      boots: z.object({ outages: z.array(Boot) }).parse(await response.json()).outages,
    };
  }
  return failure(response, []);
}

export async function setBootExcluded(
  deviceId: string,
  bootAt: number,
  excluded: boolean,
): Promise<{ ok: true } | Failure> {
  const response = await send('PUT', `/v1/outages/${encodeURIComponent(deviceId)}/${bootAt}`, {
    excluded,
  });
  if (response?.ok) return { ok: true };
  return failure(response, []);
}

const QuarterPeak = z.object({ ts: int, peak: int, estimated: z.boolean() });

const Power = z.object({
  devices: z.array(z.object({ id: z.string(), name: z.string() })),
  meters: z.array(
    z.object({
      meter: z.string(),
      minutes: int,
      apparentMinutes: int,
      apparentMaxVa: int.nullable(),
      activeMaxW: int.nullable(),
      activeOnlyMaxW: int.nullable(),
      top: z.array(QuarterPeak),
    }),
  ),
  eredes: z.object({ quarters: int, maxEnergyWh: int.nullable() }),
});
export type Power = z.infer<typeof Power>;

/** Peaks per meter in [from, to) (at most 93 days). */
export async function fetchPower(
  from: number,
  to: number,
): Promise<{ ok: true; power: Power } | Failure> {
  const response = await send('GET', `/v1/power?from=${from}&to=${to}`);
  if (response?.ok) return { ok: true, power: Power.parse(await response.json()) };
  return failure(response, []);
}

/** Minutes of a meter above `threshold`, as records for decodePeaks (src/domain/contracted-power.ts). */
export async function fetchPeakRecords(
  meter: string,
  from: number,
  to: number,
  threshold: number,
): Promise<{ ok: true; records: ArrayBuffer; truncated: boolean } | Failure> {
  const query = new URLSearchParams({
    meter,
    from: String(from),
    to: String(to),
    threshold: String(threshold),
  });
  const response = await send('GET', `/v1/power/peaks?${query}`);
  if (response?.ok) {
    return {
      ok: true,
      records: await response.arrayBuffer(),
      truncated: response.headers.get('X-Truncated') === '1',
    };
  }
  return failure(response, []);
}

/** GET /v1/seconds: a meter's per-second values in [from, to) (≤ 25 h), as records. */
export async function fetchSeconds(
  meter: string,
  from: number,
  to: number,
): Promise<{ ok: true; records: ArrayBuffer } | Failure> {
  const query = new URLSearchParams({ meter, from: String(from), to: String(to) });
  const response = await send('GET', `/v1/seconds?${query}`);
  if (response?.ok) return { ok: true, records: await response.arrayBuffer() };
  return failure(response, []);
}

const Signature = z.object({
  id: z.string(),
  meter: z.string(),
  label: z.string(),
  from: int,
  to: int,
  minutes: int,
  createdAt: int,
});
export type Signature = z.infer<typeof Signature>;

/** The calibrations kept (server/src/repo/signatures.ts), the latest first. */
export async function fetchSignatures(): Promise<{ ok: true; signatures: Signature[] } | Failure> {
  const response = await send('GET', '/v1/signatures');
  if (response?.ok) {
    const { signatures } = z
      .object({ signatures: z.array(Signature) })
      .parse(await response.json());
    return { ok: true, signatures };
  }
  return failure(response, []);
}

/**
 * Keeps the per-second values of a marked run; `noSeconds` while the Shelly has
 * not sent those minutes yet (it sends each one after it ends).
 */
export async function createSignature(input: {
  meter: string;
  label: string;
  from: number;
  to: number;
}): Promise<{ ok: true; signature: Signature } | { ok: false; reason: 'noSeconds' } | Failure> {
  const response = await send('POST', '/v1/signatures', input);
  if (response?.ok) {
    return {
      ok: true,
      signature: z.object({ signature: Signature }).parse(await response.json()).signature,
    };
  }
  if (response?.status === 409 && !isDemo()) return { ok: false, reason: 'noSeconds' };
  return failure(response, [400, 404]);
}

export async function fetchSignatureSeconds(
  id: string,
): Promise<{ ok: true; records: ArrayBuffer } | Failure> {
  const response = await send('GET', `/v1/signatures/${encodeURIComponent(id)}/seconds`);
  if (response?.ok) return { ok: true, records: await response.arrayBuffer() };
  return failure(response, []);
}

export async function deleteSignature(id: string): Promise<{ ok: true } | Failure> {
  const response = await send('DELETE', `/v1/signatures/${encodeURIComponent(id)}`);
  if (response?.ok) return { ok: true };
  return failure(response, []);
}

const Appliance = z.object({
  id: z.string(),
  label: z.string(),
  powerW: int,
  statesW: z.array(int),
  pulsing: z.boolean(),
  minDurationS: int.nullable(),
  maxDurationS: int.nullable(),
  // Missing from a server before migration 0018 (a cached response).
  heats: int.nullable().default(null),
  createdAt: int,
});
export type Appliance = z.infer<typeof Appliance>;

/** The appliances the house named (server/src/repo/appliances.ts). */
const NilmDayRow = z.object({
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  version: z.number().int(),
  minutes: z.number().int(),
  data: z.string(),
});
export type NilmDayRow = z.infer<typeof NilmDayRow>;

/** The days' cycles kept on the server (src/nilm/stored.ts), from and to inclusive. */
export async function fetchNilmDays(
  meter: string,
  from: string,
  to: string,
): Promise<{ ok: true; days: NilmDayRow[] } | Failure> {
  const query = new URLSearchParams({ meter, from, to });
  const response = await send('GET', `/v1/nilm/days?${query}`);
  if (response?.ok) {
    const { days } = z.object({ days: z.array(NilmDayRow) }).parse(await response.json());
    return { ok: true, days };
  }
  return failure(response, []);
}

/** Keeps the days' cycles on the server, each replacing what was there. */
export async function saveNilmDays(
  meter: string,
  days: readonly NilmDayRow[],
): Promise<{ ok: true } | Failure> {
  const response = await send('PUT', '/v1/nilm/days', { meter, days });
  if (response?.ok) return { ok: true };
  return failure(response, []);
}

/**
 * PVGIS's production for 1 kWp at the household's locality (GET /v1/solar,
 * docs/pvgis.md); 'noLocation' until a locality is chosen. The demonstration
 * reads a kept answer for Lisbon (35°, south), whatever the panels.
 */
export async function fetchSolarYear(panels: {
  angle: number;
  aspect: number;
  loss: number;
}): Promise<{ ok: true; year: SolarYear } | { ok: false; reason: 'noLocation' } | Failure> {
  const query = new URLSearchParams({
    angle: String(panels.angle),
    aspect: String(panels.aspect),
    loss: String(panels.loss),
  });
  let response: Response | null;
  try {
    response = await (isDemo() ? fetch('/data/pvgis-demo.json') : fetch(`/v1/solar?${query}`));
  } catch {
    response = null;
  }
  if (response?.ok) {
    const year = parsePvgis(await response.json().catch(() => null));
    return year ? { ok: true, year } : { ok: false, reason: 'unavailable' };
  }
  if (response?.status === 409) return { ok: false, reason: 'noLocation' };
  return failure(response, [400]);
}

export async function fetchAppliances(): Promise<{ ok: true; appliances: Appliance[] } | Failure> {
  const response = await send('GET', '/v1/appliances');
  if (response?.ok) {
    const { appliances } = z
      .object({ appliances: z.array(Appliance) })
      .parse(await response.json());
    return { ok: true, appliances };
  }
  return failure(response, []);
}

export async function createAppliance(input: {
  label: string;
  powerW: number;
  statesW: number[];
  pulsing: boolean;
  minDurationS: number | null;
  maxDurationS: number | null;
  heats: number | null;
}): Promise<{ ok: true; appliance: Appliance } | Failure> {
  const response = await send('POST', '/v1/appliances', input);
  if (response?.ok) {
    return {
      ok: true,
      appliance: z.object({ appliance: Appliance }).parse(await response.json()).appliance,
    };
  }
  return failure(response, [400, 409]);
}

/** A new name, or the durations widened by another programme. */
export async function updateAppliance(
  id: string,
  change: { label?: string; durations?: { minS: number; maxS: number } },
): Promise<{ ok: true } | Failure> {
  const response = await send('PATCH', `/v1/appliances/${encodeURIComponent(id)}`, change);
  if (response?.ok) return { ok: true };
  return failure(response, [400, 404]);
}

export async function deleteAppliance(id: string): Promise<{ ok: true } | Failure> {
  const response = await send('DELETE', `/v1/appliances/${encodeURIComponent(id)}`);
  if (response?.ok) return { ok: true };
  return failure(response, []);
}

const EredesSummary = z.object({
  quarters: int,
  estimated: int,
  energyWh: int,
  from: int.nullable(),
  to: int.nullable(),
  /** Each day imported: [day, quarters, estimated] (null when not counted). */
  days: z.array(z.tuple([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), int.nullable(), int.nullable()])),
});
export type EredesSummary = z.infer<typeof EredesSummary>;

/** What was imported from E-Redes. */
export async function fetchEredesSummary(): Promise<
  { ok: true; summary: EredesSummary } | Failure
> {
  const response = await send('GET', '/v1/import/eredes');
  if (response?.ok) return { ok: true, summary: EredesSummary.parse(await response.json()) };
  return failure(response, []);
}

/** Quarter hours per request (30 days); the server takes up to 3000. */
export const EREDES_BATCH = 2880;

/** Sends one batch of quarter hours [start, Wh, estimated]; idempotent. */
export async function importEredesBatch(
  quarters: [number, number, 0 | 1][],
): Promise<{ ok: true; written: number } | Failure> {
  const response = await send('POST', '/v1/import/eredes', { quarters });
  if (response?.ok) {
    const { written } = z.object({ written: int }).parse(await response.json());
    return { ok: true, written };
  }
  return failure(response, [400, 413]);
}

export async function deleteEredesImport(): Promise<{ ok: true } | Failure> {
  const response = await send('DELETE', '/v1/import/eredes');
  if (response?.ok) return { ok: true };
  return failure(response, []);
}

const EnergyMeters = z.object({
  meters: z.array(z.object({ meter: z.string(), days: int, energyWh: int })),
});
export type EnergyMeter = z.infer<typeof EnergyMeters>['meters'][number];

/** Meters with data on the days of [from, to) (at most 400 days). */
export async function fetchEnergyMeters(
  from: number,
  to: number,
): Promise<{ ok: true; meters: EnergyMeter[] } | Failure> {
  const response = await send('GET', `/v1/energy?from=${from}&to=${to}`);
  if (response?.ok) return { ok: true, ...EnergyMeters.parse(await response.json()) };
  return failure(response, []);
}

import type { DayEnergy } from '../domain/reconciliation';
export type { DayEnergy };
const DailyEnergy = z.object({
  days: z.array(
    z
      .tuple([z.string(), int])
      .rest(int.nullable())
      .transform(([date, wh, minutes]): DayEnergy => [date, wh, minutes ?? null]),
  ),
});

/** Energy of a meter per Lisbon day of [from, to), oldest first. */
export async function fetchDailyEnergy(
  meter: string,
  from: number,
  to: number,
): Promise<{ ok: true; days: DayEnergy[] } | Failure> {
  const query = new URLSearchParams({ meter, from: String(from), to: String(to) });
  const response = await send('GET', `/v1/energy/days?${query}`);
  if (response?.ok) return { ok: true, ...DailyEnergy.parse(await response.json()) };
  return failure(response, []);
}

/** Energy per quarter hour of a meter, decoded from its records (uint32 ts · uint32 Wh). */
export async function fetchQuarterEnergy(
  meter: string,
  from: number,
  to: number,
): Promise<{ ok: true; quarters: { ts: number; energyWh: number }[] } | Failure> {
  const query = new URLSearchParams({ meter, from: String(from), to: String(to) });
  const response = await send('GET', `/v1/energy/quarters?${query}`);
  if (!response?.ok) return failure(response, []);
  const view = new DataView(await response.arrayBuffer());
  const quarters: { ts: number; energyWh: number }[] = [];
  for (let offset = 0; offset + 8 <= view.byteLength; offset += 8) {
    quarters.push({ ts: view.getUint32(offset, true), energyWh: view.getUint32(offset + 4, true) });
  }
  return { ok: true, quarters };
}

/** The ERSE offers (public/data, 1,7 MB): fetched only when needed. */
export async function fetchOffers(): Promise<OffersFile | null> {
  try {
    const response = await fetch(OFFERS_URL);
    return response.ok ? offersFileSchema.parse(await response.json()) : null;
  } catch {
    return null;
  }
}

/** The OMIE prices served with the app (public/data/omie-pt.json); null when they cannot be read. */
export async function fetchOmie(): Promise<OmieFile | null> {
  try {
    const response = await fetch(OMIE_URL);
    return response.ok ? omieFileSchema.parse(await response.json()) : null;
  } catch {
    return null;
  }
}

const OmieDays = z.object({
  days: z.array(
    z.object({
      date: z.string(),
      start: z.number().int(),
      step: z.number().int(),
      prices: z.array(z.number().int()),
    }),
  ),
});
export type OmieDays = z.infer<typeof OmieDays>['days'];

/** Today's and tomorrow's market prices the Worker read (GET /v1/omie); null when unavailable. */
export async function fetchOmieDays(): Promise<OmieDays | null> {
  const response = await send('GET', '/v1/omie');
  return response?.ok ? OmieDays.parse(await response.json()).days : null;
}

/** The user's AI settings kept in their account (GET /v1/ai-settings): the key opened by the server. */
const AccountAiSettings = z.object({
  apiKey: z.string(),
  model: z.string(),
  autoSend: z.boolean(),
});
export type AccountAiSettings = z.infer<typeof AccountAiSettings>;

/** null: the account has none. "unavailable" also covers a server without AI_KEY_SECRET (503). */
export async function fetchAccountAiSettings(): Promise<
  { ok: true; settings: AccountAiSettings | null } | Failure
> {
  const response = await send('GET', '/v1/ai-settings');
  if (response?.status === 404) return { ok: true, settings: null };
  if (response?.ok) return { ok: true, settings: AccountAiSettings.parse(await response.json()) };
  return failure(response, []);
}

export async function saveAccountAiSettings(
  settings: AccountAiSettings,
): Promise<{ ok: true } | Failure> {
  const response = await send('PUT', '/v1/ai-settings', settings);
  if (response?.ok) return { ok: true };
  return failure(response, [400]);
}

export async function deleteAccountAiSettings(): Promise<{ ok: true } | Failure> {
  const response = await send('DELETE', '/v1/ai-settings');
  if (response?.ok) return { ok: true };
  return failure(response, []);
}

/** Which alerts this browser wants (server/src/alerts.ts). */
const PushAlerts = z.object({
  stale: z.boolean(),
  power: z.boolean(),
  database: z.boolean(),
  cheapHours: z.boolean(),
  eredesImport: z.boolean(),
  tariffReview: z.boolean(),
  budget: z.boolean(),
  // Absent from a server older than migration 0023.
  unusualDay: z.boolean().default(false),
});
export type PushAlerts = z.infer<typeof PushAlerts>;

/** The server's VAPID key; "invalid" when the server has none (503 not_configured). */
export async function fetchPushKey(): Promise<{ ok: true; publicKey: string } | Failure> {
  // No alerts in the demonstration: nothing to subscribe to.
  if (isDemo()) return { ok: false, reason: 'demo' };
  const response = await send('GET', '/v1/push/key');
  if (response?.status === 503) {
    const answer = z.object({ error: z.string() }).safeParse(
      await response
        .clone()
        .json()
        .catch(() => null),
    );
    if (answer.success && answer.data.error === 'not_configured')
      return { ok: false, reason: 'invalid' };
  }
  if (response?.ok) {
    return { ok: true, ...z.object({ publicKey: z.string() }).parse(await response.json()) };
  }
  return failure(response, []);
}

/** null: the server does not know this browser's subscription. */
export async function fetchPushAlerts(
  endpoint: string,
): Promise<{ ok: true; alerts: PushAlerts | null } | Failure> {
  const response = await send(
    'GET',
    `/v1/push/subscription?endpoint=${encodeURIComponent(endpoint)}`,
  );
  if (response?.status === 404) return { ok: true, alerts: null };
  if (response?.ok) {
    return {
      ok: true,
      alerts: z.object({ alerts: PushAlerts }).parse(await response.json()).alerts,
    };
  }
  return failure(response, []);
}

export async function savePushSubscription(subscription: {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  alerts: PushAlerts;
}): Promise<{ ok: true } | Failure> {
  const response = await send('PUT', '/v1/push/subscription', subscription);
  if (response?.ok) return { ok: true };
  return failure(response, [400]);
}

export async function deletePushSubscription(endpoint: string): Promise<{ ok: true } | Failure> {
  const response = await send('DELETE', '/v1/push/subscription', { endpoint });
  if (response?.ok) return { ok: true };
  return failure(response, []);
}

/** 502: the push service refused (the browser dropped the subscription). */
export async function sendTestPush(endpoint: string): Promise<{ ok: true } | Failure> {
  const response = await send('POST', '/v1/push/test', { endpoint });
  if (response?.ok) return { ok: true };
  return failure(response, [404, 502]);
}
