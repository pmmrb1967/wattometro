// SPDX-License-Identifier: AGPL-3.0-or-later
/** Which build is running, set by vite.config.ts at build time (shown in the footer). */
declare const __APP_COMMIT__: string;

export const APP_COMMIT = __APP_COMMIT__;
export const SOURCE_URL = 'https://github.com/pmmrb1967/wattometro';
export const LICENSE_URL = `${SOURCE_URL}/blob/main/LICENSE`;
