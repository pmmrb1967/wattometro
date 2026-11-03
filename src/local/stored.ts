// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Reading what this browser, or a backup file, holds. What cannot be read is
 * never treated as an empty house: the next save would destroy it, so the
 * caller gets it back as it is (docs/local-mode.md).
 */
import { LOCAL_VERSION, localDataSchema, type LocalData } from './data';

export type LocalRead =
  | { kind: 'empty' }
  | { kind: 'ok'; data: LocalData }
  /** `raw` is what is there; absent when the browser could not read at all. */
  | { kind: 'unreadable'; raw?: unknown };

type Fields = Record<string, unknown>;

/** Takes a household of version N to N + 1, keyed by N. */
export type LocalMigrations = Record<number, (old: Fields) => Fields>;

const MIGRATIONS: LocalMigrations = {
  // Version 2: the list of what stays on (src/domain/always-on.ts).
  1: (old) => ({ ...old, alwaysOn: [] }),
  // Version 3: the register of the house's equipment (src/domain/equipment.ts).
  2: (old) => ({ ...old, equipment: [] }),
};

const isRecord = (value: unknown): value is Fields =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** `raw` at the current version; as it was when no step leads there (the schema then refuses it). */
function migrated(raw: unknown, migrations: LocalMigrations): unknown {
  if (!isRecord(raw)) return raw;
  let current = raw;
  for (let version = current.version; typeof version === 'number'; version += 1) {
    if (version >= LOCAL_VERSION) return current;
    const step = migrations[version];
    if (!step) return raw;
    current = { ...step(current), version: version + 1 };
  }
  return raw;
}

export function readStored(raw: unknown, migrations = MIGRATIONS): LocalRead {
  if (raw === undefined) return { kind: 'empty' };
  try {
    const parsed = localDataSchema.safeParse(migrated(raw, migrations));
    return parsed.success ? { kind: 'ok', data: parsed.data } : { kind: 'unreadable', raw };
  } catch {
    return { kind: 'unreadable', raw };
  }
}
