// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The API of the demonstration mode, answered in the browser from the
 * fictional household (model.ts): the same routes and response shapes as
 * the Worker (server/src/routes/), so the pages and src/api/ work unchanged. Nothing is
 * sent to the server. Changes (tariff, zone, locality, outages not counted) live in
 * memory until the demonstration ends; the account and devices cannot change
 * (409 {error: 'demo'}).
 * The E-Redes "import" is the Shelly's quarter hours up to EREDES_LAG_DAYS ago,
 * as when the last file was downloaded a few days back, 2 % lower (a Shelly
 * reads a little differently from the grid meter).
 * The household lives in state.ts and the answers built from its data in
 * views.ts; this file maps each route to them.
 */
import { z } from 'zod';
import { alwaysOnInputSchema } from '../domain/always-on';
import { budgetSchema } from '../domain/budget';
import { equipmentInputSchema, nameKey, sendsEstimate } from '../domain/equipment';
import { locationBodySchema } from '../domain/location';
import {
  addEquipment,
  changeEquipment,
  namedEquipment,
  sortedEquipment,
} from '../domain/equipment-list';
import { installationSchema } from '../domain/installation';
import { tariffInputSchema } from '../domain/tariff';
import { lisbonDate } from '../lib/time';
import { DEMO_DAYS } from './model';
import { dailyEnergy, empty, energyRecords, invalid, json } from './responses';
import {
  DAY,
  DEMO_ME,
  type DemoSignature,
  METER,
  applianceInput,
  current,
  isLinkedLabel,
  renameLinked,
  renameSignatures,
  signatureRange,
} from './state';
import {
  boots,
  demoOmieDays,
  devices,
  meterQuarters,
  now,
  peaks,
  power,
  quality,
  secondsRecords,
  signatureView,
} from './views';

export { DEMO_ME, resetDemo } from './state';

const readOnly = () => json({ error: 'demo' }, 409);

const numberParam = (url: URL, name: string) => {
  const value = Number(url.searchParams.get(name));
  return Number.isInteger(value) ? value : null;
};

const DemoNilmBody = z.object({
  meter: z.literal(METER),
  days: z.array(
    z.object({
      day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      version: z.number().int().min(1),
      minutes: z.number().int().min(0),
      data: z.string().min(1),
    }),
  ),
});

const demoNilmDays = (body: unknown) => DemoNilmBody.safeParse(body).data?.days ?? null;

/** Answers one API request of the demonstration. */
export function demoResponse(method: string, path: string, body?: unknown): Response {
  const url = new URL(path, 'https://demo.invalid');
  const route = `${method} ${url.pathname}`;
  const demo = current();
  const { data } = demo;
  const from = numberParam(url, 'from');
  const to = numberParam(url, 'to');
  const range = from !== null && to !== null && from < to && to - from <= DEMO_DAYS * DAY;
  // "Potência" looks back a year, as the server allows; the data stops at DEMO_DAYS.
  const yearRange = from !== null && to !== null && from < to && to - from <= 366 * DAY;

  switch (route) {
    case 'GET /v1/auth/me':
      return json(DEMO_ME);
    case 'POST /v1/auth/logout':
      return empty();
    // As a server without VAPID keys: no alerts in the demonstration.
    case 'GET /v1/push/key':
    case 'GET /v1/push/subscription':
    case 'PUT /v1/push/subscription':
    case 'DELETE /v1/push/subscription':
    case 'POST /v1/push/test':
      return json({ error: 'not_configured' }, 503);
    // As a server without AI_KEY_SECRET: a key tried in the demonstration stays in this browser.
    case 'GET /v1/ai-settings':
    case 'PUT /v1/ai-settings':
    case 'DELETE /v1/ai-settings':
      return json({ error: 'not_configured' }, 503);
    case 'GET /v1/devices':
      return json({ devices: devices(data) });
    case 'GET /v1/now':
      return json(now(data));
    case 'GET /v1/energy': {
      if (from === null || to === null || from >= to) return invalid();
      return json({
        meters: ['eredes', METER].flatMap((meter) => {
          const quarters = meterQuarters(data, meter, from, to) ?? [];
          return quarters.length === 0
            ? []
            : [
                {
                  meter,
                  days: dailyEnergy(quarters).length,
                  energyWh: quarters.reduce((sum, [, wh]) => sum + wh, 0),
                },
              ];
        }),
      });
    }
    case 'GET /v1/energy/days':
    case 'GET /v1/energy/quarters': {
      const quarters =
        from === null || to === null
          ? null
          : meterQuarters(data, url.searchParams.get('meter') ?? '', from, to);
      if (!quarters) return invalid();
      return route === 'GET /v1/energy/days'
        ? json({ days: dailyEnergy(quarters, url.searchParams.get('meter') !== 'eredes') })
        : energyRecords(quarters);
    }
    case 'GET /v1/import/eredes': {
      const quarters = meterQuarters(data, 'eredes', data.start, Number.MAX_SAFE_INTEGER) ?? [];
      const days = new Map<string, number>();
      for (const [ts] of quarters) days.set(lisbonDate(ts), (days.get(lisbonDate(ts)) ?? 0) + 1);
      return json({
        quarters: quarters.length,
        estimated: 0,
        energyWh: quarters.reduce((sum, [, wh]) => sum + wh, 0),
        from: quarters[0]?.[0] ?? null,
        to: quarters.length > 0 ? (quarters.at(-1)?.[0] ?? 0) + 900 : null,
        days: [...days].map(([day, count]) => [day, count, 0]),
      });
    }
    case 'GET /v1/tariffs':
      return json({ tariffs: demo.tariffs });
    case 'GET /v1/omie':
      return json({ days: demoOmieDays() });
    case 'POST /v1/tariffs': {
      const parsed = tariffInputSchema.safeParse(body);
      if (!parsed.success) return invalid();
      const tariff = { ...parsed.data, id: `demo-${parsed.data.validFrom}` };
      demo.tariffs = [
        ...demo.tariffs.filter((item) => item.validFrom !== tariff.validFrom),
        tariff,
      ].sort((a, b) => a.validFrom.localeCompare(b.validFrom));
      return json({ tariff }, 201);
    }
    case 'GET /v1/quality': {
      const low = numberParam(url, 'low');
      const high = numberParam(url, 'high');
      if (!range || low === null || high === null) return invalid();
      return json(quality(demo, from, to, low, high));
    }
    case 'PUT /v1/quality/zone': {
      const zone = (body as { zone?: unknown } | undefined)?.zone;
      if (zone !== null && zone !== 'A' && zone !== 'B' && zone !== 'C') return invalid();
      demo.zone = zone;
      return empty();
    }
    case 'GET /v1/household/location':
      return json({ location: demo.location });
    case 'PUT /v1/household/location': {
      const parsed = locationBodySchema.safeParse(body);
      if (!parsed.success) return invalid();
      demo.location = parsed.data.location;
      return empty();
    }
    case 'POST /v1/visit':
      return empty();
    case 'GET /v1/household/budget':
      return json({ budget: demo.budget });
    case 'PUT /v1/household/budget': {
      const parsed = budgetSchema
        .nullable()
        .safeParse((body as { budget?: unknown } | undefined)?.budget);
      if (!parsed.success) return invalid();
      demo.budget = parsed.data;
      return empty();
    }
    case 'GET /v1/household/installation':
      return json({ installation: demo.installation });
    case 'PUT /v1/household/installation': {
      const parsed = installationSchema.safeParse(
        (body as { installation?: unknown } | undefined)?.installation,
      );
      if (!parsed.success) return invalid();
      demo.installation = parsed.data;
      return empty();
    }
    case 'GET /v1/outages':
      if (from === null || to === null) return invalid();
      return json({
        outages: boots(demo).filter((boot) => boot.bootAt >= from && boot.bootAt < to),
      });
    case 'GET /v1/power':
      return yearRange ? json(power(data, from, to)) : invalid();
    case 'GET /v1/seconds':
      if (!range || to - from > 25 * 3600 || url.searchParams.get('meter') !== METER) {
        return invalid();
      }
      return secondsRecords(data, from, to);
    case 'GET /v1/signatures':
      return json({
        signatures: [...demo.signatures]
          .sort((a, b) => b.from - a.from)
          .map((signature) => signatureView(data, signature)),
      });
    case 'POST /v1/signatures': {
      const input = body as Partial<Record<'meter' | 'label' | 'from' | 'to', unknown>> | undefined;
      const label = typeof input?.label === 'string' ? input.label.trim() : '';
      const { from: start, to: end } = input ?? {};
      if (
        input?.meter !== METER ||
        label === '' ||
        label.length > 60 ||
        !Number.isInteger(start) ||
        !Number.isInteger(end) ||
        (start as number) >= (end as number) ||
        (end as number) - (start as number) > 4 * 3600
      ) {
        return invalid();
      }
      const signature: DemoSignature = {
        id: `demo-${demo.signatures.length + 1}-${start as number}`,
        label,
        from: start as number,
        to: end as number,
        createdAt: Math.floor(Date.now() / 1000),
      };
      const view = signatureView(data, signature);
      if (view.minutes === 0) return invalid();
      demo.signatures.push(signature);
      return json({ signature: view }, 201);
    }
    case 'GET /v1/nilm/days': {
      const first = url.searchParams.get('from') ?? '';
      const last = url.searchParams.get('to') ?? '';
      if (url.searchParams.get('meter') !== METER) return invalid();
      return json({
        days: [...demo.nilmDays.values()]
          .filter((item) => item.day >= first && item.day <= last)
          .sort((a, b) => a.day.localeCompare(b.day)),
      });
    }
    case 'PUT /v1/nilm/days': {
      const days = demoNilmDays(body);
      if (!days) return invalid();
      for (const item of days) demo.nilmDays.set(item.day, item);
      return empty();
    }
    case 'GET /v1/appliances':
      return json({
        appliances: [...demo.appliances].sort((a, b) => a.label.localeCompare(b.label, 'pt')),
      });
    case 'POST /v1/appliances': {
      const input = applianceInput(body);
      if (!input) return invalid();
      const equipment = namedEquipment(demo.equipment, input.label);
      const appliance = {
        id: `demo-appliance-${demo.appliances.length + 1}-${Date.now()}`,
        ...input,
        label: equipment?.name ?? input.label,
        equipmentId: equipment?.id ?? null,
        createdAt: Math.floor(Date.now() / 1000),
      };
      if (equipment) renameSignatures(demo, [input.label], equipment.name);
      demo.appliances.push(appliance);
      return json({ appliance }, 201);
    }
    case 'GET /v1/equipment':
      return json({ items: sortedEquipment(demo.equipment) });
    case 'POST /v1/equipment': {
      const parsed = equipmentInputSchema.safeParse(body);
      if (!parsed.success) return invalid();
      const added = addEquipment(
        demo.equipment,
        parsed.data,
        `demo-eq-${demo.equipment.length + 1}-${Date.now()}`,
        Math.floor(Date.now() / 1000),
      );
      if (typeof added === 'string') return json({ error: added }, 409);
      demo.equipment = added.items;
      return json({ item: added.item }, 201);
    }
    case 'GET /v1/always-on':
      return json({
        items: [...demo.alwaysOn].sort((a, b) => a.label.localeCompare(b.label, 'pt')),
      });
    case 'POST /v1/always-on': {
      const parsed = alwaysOnInputSchema.safeParse(body);
      if (!parsed.success) return invalid();
      const item = {
        ...parsed.data,
        id: `demo-on-${demo.alwaysOn.length + 1}-${Date.now()}`,
        createdAt: Math.floor(Date.now() / 1000),
      };
      demo.alwaysOn.push(item);
      return json({ item }, 201);
    }
    case 'GET /v1/power/peaks': {
      const threshold = numberParam(url, 'threshold');
      if (!yearRange || threshold === null || url.searchParams.get('meter') !== METER) {
        return invalid();
      }
      return peaks(data, from, to, threshold);
    }
  }

  const alwaysOn = /^\/v1\/always-on\/([^/]+)$/.exec(url.pathname);
  if (alwaysOn) {
    const id = decodeURIComponent(alwaysOn[1] as string);
    if (method === 'DELETE') {
      demo.alwaysOn = demo.alwaysOn.filter((item) => item.id !== id);
      return empty();
    }
    if (method === 'PUT') {
      const parsed = alwaysOnInputSchema.safeParse(body);
      if (!parsed.success) return invalid();
      const found = demo.alwaysOn.find((item) => item.id === id);
      if (!found) return json({ error: 'not_found' }, 404);
      Object.assign(found, parsed.data);
      return empty();
    }
  }

  const equipment = /^\/v1\/equipment\/([^/]+)(\/link)?$/.exec(url.pathname);
  if (equipment) {
    const id = decodeURIComponent(equipment[1] as string);
    const found = demo.equipment.find((item) => item.id === id);
    if (method === 'POST' && equipment[2]) {
      const labels = (body as { labels?: unknown } | undefined)?.labels;
      if (!Array.isArray(labels) || !labels.every((label) => typeof label === 'string')) {
        return invalid();
      }
      if (!found) return json({ error: 'not_found' }, 404);
      const wanted = new Set(labels.map(nameKey));
      const chosen = demo.appliances.filter((item) => wanted.has(nameKey(item.label)));
      for (const item of chosen) item.equipmentId = id;
      renameLinked(demo, id, found.name);
      return empty();
    }
    if (method === 'PUT' && !equipment[2]) {
      const parsed = equipmentInputSchema.safeParse(body);
      if (!parsed.success) return invalid();
      const changed = changeEquipment(demo.equipment, id, parsed.data, sendsEstimate(body));
      if (changed === 'not_found') return json({ error: changed }, 404);
      if (changed === 'name_taken') return json({ error: changed }, 409);
      const key = nameKey(parsed.data.name);
      for (const item of demo.appliances) {
        if (item.equipmentId === null && nameKey(item.label) === key) item.equipmentId = id;
      }
      demo.equipment = changed;
      renameLinked(demo, id, parsed.data.name, found ? [found.name] : []);
      return empty();
    }
    if (method === 'DELETE' && !equipment[2]) {
      for (const item of demo.appliances) if (item.equipmentId === id) item.equipmentId = null;
      demo.equipment = demo.equipment.filter((item) => item.id !== id);
      return empty();
    }
  }

  const appliance = /^\/v1\/appliances\/([^/]+)$/.exec(url.pathname);
  if (appliance) {
    const id = decodeURIComponent(appliance[1] as string);
    const found = demo.appliances.find((item) => item.id === id);
    if (method === 'PATCH') {
      const { label, durations, periodS } = (body ?? {}) as {
        label?: unknown;
        durations?: unknown;
        periodS?: unknown;
      };
      const name = typeof label === 'string' ? label.trim() : null;
      const range = durations as { minS?: unknown; maxS?: unknown } | undefined;
      if (name === null && range === undefined && periodS === undefined) return invalid();
      if (
        periodS !== undefined &&
        periodS !== null &&
        (!Number.isInteger(periodS) || (periodS as number) < 1 || (periodS as number) > 600)
      ) {
        return invalid();
      }
      if (name !== null && (name === '' || name.length > 60)) return invalid();
      if (
        range !== undefined &&
        (!Number.isInteger(range.minS) ||
          !Number.isInteger(range.maxS) ||
          (range.minS as number) > (range.maxS as number))
      ) {
        return invalid();
      }
      if (!found) return json({ error: 'not_found' }, 404);
      if (name !== null && found.equipmentId !== null) return json({ error: 'linked' }, 409);
      if (periodS !== undefined) found.periodS = periodS as number | null;
      if (name !== null) {
        const equipment = namedEquipment(demo.equipment, name);
        if (equipment) renameSignatures(demo, [name], equipment.name);
        found.label = equipment?.name ?? name;
        found.equipmentId = equipment?.id ?? null;
      }
      if (range !== undefined) {
        found.minDurationS = range.minS as number;
        found.maxDurationS = range.maxS as number;
      }
      return empty();
    }
    if (method === 'DELETE') {
      demo.appliances = demo.appliances.filter((item) => item.id !== id);
      return empty();
    }
  }

  const signature = /^\/v1\/signatures\/([^/]+)(\/seconds)?$/.exec(url.pathname);
  if (signature) {
    const id = decodeURIComponent(signature[1] as string);
    const found = demo.signatures.find((item) => item.id === id);
    if (method === 'GET' && signature[2]) {
      return found
        ? secondsRecords(data, ...signatureRange(found))
        : json({ error: 'not_found' }, 404);
    }
    if (method === 'PATCH' && !signature[2] && found) {
      const label = (body as { label?: unknown } | undefined)?.label;
      if (typeof label !== 'string') return json({ error: 'invalid_request' }, 400);
      if (isLinkedLabel(demo, found.label)) return json({ error: 'linked' }, 409);
      for (const item of demo.signatures) {
        if (item.label === found.label && item !== found) item.label = label;
      }
      found.label = label;
      return empty();
    }
    if (method === 'DELETE' && !signature[2]) {
      demo.signatures = demo.signatures.filter((item) => item.id !== id);
      return empty();
    }
  }
  if (method === 'DELETE' && url.pathname.startsWith('/v1/tariffs/')) {
    const id = decodeURIComponent(url.pathname.slice('/v1/tariffs/'.length));
    demo.tariffs = demo.tariffs.filter((tariff) => tariff.id !== id);
    return empty();
  }
  const outage = /^\/v1\/outages\/[^/]+\/(\d+)$/.exec(url.pathname);
  if (method === 'PUT' && outage) {
    const excluded = (body as { excluded?: unknown } | undefined)?.excluded;
    if (typeof excluded !== 'boolean') return invalid();
    const bootAt = Number(outage[1]);
    if (excluded) demo.excluded.add(bootAt);
    else demo.excluded.delete(bootAt);
    return empty();
  }
  // The account, the household's name and the devices stay as they are.
  return readOnly();
}
