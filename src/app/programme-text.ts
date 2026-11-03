// SPDX-License-Identifier: AGPL-3.0-or-later
/** One whole programme against the manual (src/domain/equipment-programmes.ts), as a sentence. */
import type { ProgrammeUse } from '../domain/equipment-programmes';
import { t } from '../i18n/pt-PT';
import { formatDuration, formatHoursMinutes } from '../lib/time';
import { formatKwh } from '../lib/units';

export function programmeText(use: ProgrammeUse): string {
  if (!use.programme) return t.dayEvents.noProgramme(formatDuration(use.durationS));
  return t.dayEvents.likelyProgramme(
    use.programme.name,
    formatHoursMinutes(use.programme.durationS),
    formatKwh(use.programme.energyWh, 2),
    formatKwh(use.energyWh, 2),
    use.differencePct === null ? null : t.equipment.difference(use.differencePct),
  );
}
