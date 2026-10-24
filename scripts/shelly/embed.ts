// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The copy of shelly/wattometro.js uploaded to a Shelly, with the URL and
 * token written into INSTALLED: the EM Gen3 empties its KVS on every reboot
 * (docs/shelly.md, "KVS"), the script's code survives. Only the uploaded copy
 * has them; the repository's file keeps INSTALLED empty.
 */
const MARKER = "let INSTALLED = { url: '', token: '' };";

export function embedConfig(code: string, config: { url: string; token: string }): string {
  if (!code.includes(MARKER)) throw new Error(`shelly/wattometro.js lacks: ${MARKER}`);
  return code.replace(
    MARKER,
    `let INSTALLED = { url: ${JSON.stringify(config.url)}, token: ${JSON.stringify(config.token)} };`,
  );
}
