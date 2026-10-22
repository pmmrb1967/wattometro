// SPDX-License-Identifier: AGPL-3.0-or-later
/** Calls to the project's API, same-origin under /v1. Every response is validated with zod. */
import { z } from 'zod';
import { OFFERS_URL, offersFileSchema, type OffersFile } from '../domain/erse';
import { tariffInputSchema, type Tariff, type TariffInput } from '../domain/tariff';

const Health = z.object({ status: z.enum(['ok', 'degraded']), database: z.boolean() });
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
  database: z.object({ sizeBytes: z.number().int().nullable(), limitBytes: z.number().int() }),
});
export type Now = z.infer<typeof Now>;
export type Meter = Now['meters'][number];

const Me = z.object({ email: z.string(), householdId: z.string(), householdName: z.string() });
export type Me = z.infer<typeof Me>;

/** Reasons a request can fail that the user can act on. */
export type Failure =
  | { ok: false; reason: 'invalid' | 'unavailable' | 'unauthenticated' }
  | { ok: false; reason: 'locked'; retryAfter: number };

const Locked = z.object({ retryAfter: z.number().int() });

async function send(method: string, path: string, body?: unknown): Promise<Response | null> {
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
  const response = await fetch('/v1/auth/me', { signal });
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

/** The ERSE offers (public/data, 1,7 MB): fetched only when needed. */
export async function fetchOffers(): Promise<OffersFile | null> {
  try {
    const response = await fetch(OFFERS_URL);
    return response.ok ? offersFileSchema.parse(await response.json()) : null;
  } catch {
    return null;
  }
}
