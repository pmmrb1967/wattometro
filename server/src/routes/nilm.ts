// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Appliances: each day's cycles, the named appliances and the calibrations.
 *
 *   POST /v1/signatures        {meter, label, from, to} → 201 {signature}: the per-second values
 *                              of [from, to) (≤ 4 h, a minute beyond each side) copied to stay
 *                              (repo/signatures.ts); 404 unknown meter, 409 no_seconds yet
 *   GET  /v1/signatures        → {signatures: [{id, meter, label, from, to, minutes, createdAt}]}
 *   GET  /v1/signatures/:id/seconds → application/octet-stream, its minutes as records
 *   PATCH /v1/signatures/:id  {label} → 204: renames every calibration of that appliance;
 *                              404 not the household's; 409 linked (named as a linked appliance)
 *   DELETE /v1/signatures/:id  → 204
 *   GET  /v1/nilm/days?meter&from&to → {days: [{day, version, minutes, data}]}: the cycles the
 *                              browser found on each Lisbon day [from, to] (≤ 400 days), data
 *                              base64url as the browser stored it (repo/nilm.ts)
 *   PUT  /v1/nilm/days         {meter, days: [{day, version, minutes, data}]} (≤ 31 days, days
 *                              before today) → 204, each day replacing what was there; 404
 *                              unknown meter
 *   GET  /v1/appliances        → {appliances: [{id, label, powerW, statesW, pulsing,
 *                              minDurationS, maxDurationS, heats, periodS, equipmentId,
 *                              createdAt}]}
 *   POST /v1/appliances        {label, powerW, statesW, pulsing, minDurationS?, maxDurationS?,
 *                              heats?, periodS?}
 *                              → 201 {appliance}; 409 too_many. Named as an equipment, it is
 *                              linked to it (equipmentId) and takes its name
 *   PATCH /v1/appliances/:id   {label?, durations?: {minS, maxS}, periodS?} → 204; 404; 409 linked (a
 *                              linked appliance has the equipment's name)
 *   DELETE /v1/appliances/:id  → 204
 */
import type { Hono } from 'hono';
import { z } from 'zod';
import { lisbonDate, startOfLisbonDay } from '../../../src/lib/time';
import { fromBase64Url, toBase64Url } from '../../../src/lib/base64url';
import { listDevices } from '../repo/devices';
import {
  createAppliance,
  deleteAppliance,
  listAppliances,
  updateAppliance,
} from '../repo/appliances';
import {
  createSignature,
  deleteSignature,
  listSignatures,
  renameSignature,
  MAX_SIGNATURE_SECONDS,
  signatureRecords,
} from '../repo/signatures';
import { nilmDays, saveNilmDays } from '../repo/nilm';
import { ApplianceLabel, type AppEnv, type RouteContext } from './context';

/** Up to a day: longer than any cycle pairCycles finds (MAX_CYCLE_S). */
const DurationS = z.number().int().min(1).max(86_400);

/** A rhythm of pulses: at least a second, at most MAX_GAP_S plus a pulse (src/nilm/periodic.ts). */
const PeriodS = z.number().int().min(1).max(600);

const Durations = z
  .object({ minS: DurationS, maxS: DurationS })
  .refine(({ minS, maxS }) => minS <= maxS);

const ApplianceBody = z
  .object({
    label: ApplianceLabel,
    powerW: z.number().int().min(1).max(50_000),
    statesW: z.array(z.number().int().min(-50_000).max(50_000)).min(1).max(8),
    pulsing: z.boolean(),
    minDurationS: DurationS.nullable().default(null),
    maxDurationS: DurationS.nullable().default(null),
    heats: z.number().int().min(1).max(20).nullable().default(null),
    periodS: PeriodS.nullable().default(null),
  })
  .refine(
    ({ minDurationS, maxDurationS }) =>
      (minDurationS === null) === (maxDurationS === null) &&
      (minDurationS === null || minDurationS <= (maxDurationS as number)),
  );

const ApplianceChange = z
  .object({
    label: ApplianceLabel.optional(),
    durations: Durations.optional(),
    // null forgets a wrong rhythm.
    periodS: PeriodS.nullable().optional(),
  })
  .refine(
    ({ label, durations, periodS }) =>
      label !== undefined || durations !== undefined || periodS !== undefined,
  );

const nilmMeter = z.string().regex(/^[^:]{1,64}:[0-3]$/);

const localDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** A year and a little: the appliances' history at most in one read. */
const MAX_NILM_SPAN_DAYS = 400;

/** A day's compressed cycles (base64url): hundreds of cycles take a few tens of KB. */
export const MAX_NILM_DAY_CHARS = 200_000;

export const MAX_NILM_BYTES = 2 * 1024 * 1024;

const NilmQuery = z
  .object({ meter: nilmMeter, from: localDay, to: localDay })
  .refine(
    ({ from, to }) =>
      from <= to && startOfLisbonDay(to) - startOfLisbonDay(from) <= MAX_NILM_SPAN_DAYS * 86_400,
  );

const NilmBody = z.object({
  meter: nilmMeter,
  days: z
    .array(
      z.object({
        day: localDay,
        version: z.number().int().min(1).max(1_000_000),
        minutes: z.number().int().min(0).max(1500),
        data: z
          .string()
          .min(1)
          .max(MAX_NILM_DAY_CHARS)
          .regex(/^[A-Za-z0-9_-]+$/),
      }),
    )
    .min(1)
    .max(31)
    .refine((days) => new Set(days.map((item) => item.day)).size === days.length),
});

const SignatureBody = z
  .object({
    meter: z.string().regex(/^[^:]{1,64}:[0-3]$/),
    label: z.string().trim().min(1).max(60),
    from: z.number().int().min(0),
    to: z.number().int().min(0),
  })
  .refine(({ from, to }) => from < to && to - from <= MAX_SIGNATURE_SECONDS);

const SignatureRenameBody = z.object({ label: z.string().trim().min(1).max(60) });

export function nilmRoutes(
  app: Hono<AppEnv>,
  { config, now, requireUser, body }: RouteContext,
): void {
  // Each day's cycles (Phase 8.1): worked out in the browser, kept past the per-second values.
  app.get('/v1/nilm/days', requireUser, async (c) => {
    const parsed = NilmQuery.safeParse(c.req.query());
    if (!parsed.success) return c.json({ error: 'invalid_request' }, 400);
    const { meter, from, to } = parsed.data;
    const days = await nilmDays(config.sql, c.get('user').householdId, meter, from, to);
    return c.json({
      days: days.map((day) => ({ ...day, data: toBase64Url(day.data) })),
    });
  });

  app.put('/v1/nilm/days', requireUser, async (c) => {
    if (Number(c.req.header('Content-Length') ?? 0) > MAX_NILM_BYTES) {
      return c.json({ error: 'too_large' }, 413);
    }
    const parsed = await body(c, NilmBody);
    const today = lisbonDate(now());
    if (!parsed.success || parsed.data.days.some((item) => item.day >= today)) {
      return c.json({ error: 'invalid_request' }, 400);
    }
    const { meter, days } = parsed.data;
    const { householdId } = c.get('user');
    const [deviceId = ''] = meter.split(':');
    const known = (await listDevices(config.sql, householdId)).some((d) => d.id === deviceId);
    if (!known) return c.json({ error: 'not_found' }, 404);
    await saveNilmDays(
      config.sql,
      householdId,
      meter,
      days.map((item) => ({ ...item, data: fromBase64Url(item.data) })),
      now(),
    );
    return c.body(null, 204);
  });

  // Named appliances (Phase 8.3): the browser classifies cycles with their descriptors.
  app.get('/v1/appliances', requireUser, async (c) =>
    c.json({ appliances: await listAppliances(config.sql, c.get('user').householdId) }),
  );

  app.post('/v1/appliances', requireUser, async (c) => {
    const parsed = await body(c, ApplianceBody);
    if (!parsed.success) return c.json({ error: 'invalid_request' }, 400);
    const appliance = await createAppliance(
      config.sql,
      c.get('user').householdId,
      parsed.data,
      now(),
    );
    if (!appliance) return c.json({ error: 'too_many' }, 409);
    return c.json({ appliance }, 201);
  });

  app.patch('/v1/appliances/:id', requireUser, async (c) => {
    const parsed = await body(c, ApplianceChange);
    if (!parsed.success) return c.json({ error: 'invalid_request' }, 400);
    const { label, durations, periodS } = parsed.data;
    const outcome = await updateAppliance(
      config.sql,
      c.get('user').householdId,
      c.req.param('id'),
      {
        ...(label !== undefined ? { label } : {}),
        ...(durations !== undefined ? { durations } : {}),
        ...(periodS !== undefined ? { periodS } : {}),
      },
    );
    if (outcome === 'linked') return c.json({ error: 'linked' }, 409);
    return outcome === 'ok' ? c.body(null, 204) : c.json({ error: 'not_found' }, 404);
  });

  app.delete('/v1/appliances/:id', requireUser, async (c) => {
    await deleteAppliance(config.sql, c.get('user').householdId, c.req.param('id'));
    return c.body(null, 204);
  });

  app.post('/v1/signatures', requireUser, async (c) => {
    const parsed = await body(c, SignatureBody);
    if (!parsed.success || parsed.data.to > now()) {
      return c.json({ error: 'invalid_request' }, 400);
    }
    const { meter, label, from, to } = parsed.data;
    const [deviceId = '', channel] = meter.split(':');
    const { householdId } = c.get('user');
    const known = (await listDevices(config.sql, householdId)).some((d) => d.id === deviceId);
    if (!known) return c.json({ error: 'not_found' }, 404);
    const signature = await createSignature(
      config.sql,
      householdId,
      { deviceId, channel: Number(channel), label, from, to },
      now(),
    );
    if (!signature) return c.json({ error: 'no_seconds' }, 409);
    return c.json({ signature }, 201);
  });

  app.get('/v1/signatures', requireUser, async (c) =>
    c.json({ signatures: await listSignatures(config.sql, c.get('user').householdId) }),
  );

  app.get('/v1/signatures/:id/seconds', requireUser, async (c) => {
    const records = await signatureRecords(
      config.sql,
      c.get('user').householdId,
      c.req.param('id'),
    );
    if (!records) return c.json({ error: 'not_found' }, 404);
    c.header('Content-Type', 'application/octet-stream');
    return c.body(records.buffer as ArrayBuffer);
  });

  app.patch('/v1/signatures/:id', requireUser, async (c) => {
    const parsed = await body(c, SignatureRenameBody);
    if (!parsed.success) return c.json({ error: 'invalid_request' }, 400);
    const { householdId } = c.get('user');
    const outcome = await renameSignature(
      config.sql,
      householdId,
      c.req.param('id'),
      parsed.data.label,
    );
    if (outcome === 'linked') return c.json({ error: 'linked' }, 409);
    return outcome === 'ok' ? c.body(null, 204) : c.json({ error: 'not_found' }, 404);
  });

  app.delete('/v1/signatures/:id', requireUser, async (c) => {
    await deleteSignature(config.sql, c.get('user').householdId, c.req.param('id'));
    return c.body(null, 204);
  });
}
