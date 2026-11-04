// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Every text the user sees, in European Portuguese (post-1990 agreement, "tu").
 * Kept by page in pt-PT/; `t` joins them, so the code reads t.<section> as before.
 */
import { commonTexts } from './pt-PT/common';
import { homeTexts } from './pt-PT/home';
import { aiTexts } from './pt-PT/ai';
import { settingsTexts } from './pt-PT/settings';
import { powerTexts } from './pt-PT/power';
import { qualityTexts } from './pt-PT/quality';
import { appliancesTexts } from './pt-PT/appliances';
import { equipmentTexts } from './pt-PT/equipment';
import { consumptionTexts } from './pt-PT/consumption';
import { tariffsTexts } from './pt-PT/tariffs';
import { setupTexts } from './pt-PT/setup';

export const t = {
  ...commonTexts,
  ...homeTexts,
  ...aiTexts,
  ...settingsTexts,
  ...powerTexts,
  ...qualityTexts,
  ...appliancesTexts,
  ...equipmentTexts,
  ...consumptionTexts,
  ...tariffsTexts,
  ...setupTexts,
} as const;
