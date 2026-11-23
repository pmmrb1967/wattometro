// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Imported first by main.tsx, so that it runs before the router module is
 * evaluated: the router reads the address once, when it is created, and a
 * return to /nuvem-retorno must already be back at the page that left
 * (adapted from Faturómetro, src/main.tsx).
 */
import { startCloudReturn } from '../local/cloud-return';

startCloudReturn();
