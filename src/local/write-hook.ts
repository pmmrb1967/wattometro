// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The local server's writes, for the cloud sync runner (cloud-runner.ts), which
 * re-exports `notifyLocalWrite`. Apart so server.ts does not load the cloud
 * code (it is also used by the server's contract tests).
 */
let listener: (() => void) | null = null;

/** The local server kept a change. */
export function notifyLocalWrite(): void {
  listener?.();
}

/** One listener at a time (the running sync runner); null to stop. */
export function onLocalWrite(next: (() => void) | null): void {
  listener = next;
}
