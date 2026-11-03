// SPDX-License-Identifier: AGPL-3.0-or-later
/** A zod schema as the API's structured outputs take it. */
/** Keywords structured outputs do not accept; zod still checks them on the answer. */
const UNSUPPORTED = [
  '$schema',
  'minLength',
  'maxLength',
  'minItems',
  'maxItems',
  'minimum',
  'maximum',
];

export function forTheApi(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(forTheApi);
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !UNSUPPORTED.includes(key))
      .map(([key, item]) => [key, forTheApi(item)]),
  );
}
