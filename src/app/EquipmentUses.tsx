// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * An equipment's last whole programmes (washing machines), from the days'
 * cycles kept on the server (nilm-days.ts): each with its likely programme
 * and its energy against the manual, and the average difference. No verdict:
 * the manual measures in test conditions.
 */
import { useEffect, useState } from 'react';
import { addDays } from '../domain/consumption';
import type { Equipment } from '../domain/equipment';
import {
  averageDifferencePct,
  programmeUses,
  type ProgrammeUse,
} from '../domain/equipment-programmes';
import { t } from '../i18n/pt-PT';
import { formatLisbonDateTime, lisbonToday } from '../lib/time';
import { classify } from '../nilm/appliances';
import type { Appliance } from './api';
import { useHouseholdEnergy } from './household-energy';
import { storedAnalyses } from './nilm-days';
import { programmeText } from './programme-text';

const texts = t.equipment.uses;
/** How far back the uses go. */
export const USES_DAYS = 30;

function Uses({
  item,
  appliances,
  meter,
}: {
  item: Equipment;
  appliances: Appliance[];
  meter: string;
}) {
  const [found, setFound] = useState<{ key: string; uses: ProgrammeUse[] | 'failed' } | null>(null);
  const linked = appliances.filter((appliance) => appliance.equipmentId === item.id);
  // What changes the result: the meter, every appliance (classify picks the
  // closest of them all, linked or not) and the manual.
  const key = JSON.stringify([
    meter,
    appliances.map((appliance) => [
      appliance.id,
      appliance.equipmentId,
      appliance.minDurationS,
      appliance.maxDurationS,
    ]),
    item.programmes,
  ]);
  const uses = found?.key === key ? found.uses : null;

  useEffect(() => {
    let current = true;
    const today = lisbonToday();
    void storedAnalyses(meter, addDays(today, -USES_DAYS), today)
      .then((days) => {
        if (!current) return;
        const ids = new Set(linked.map((appliance) => appliance.id));
        const cycles = [...days.values()].flatMap((day) => {
          const named = classify(day.cycles, appliances);
          return day.cycles.filter((cycle) => {
            const appliance = named.get(cycle.start);
            return appliance !== undefined && ids.has(appliance.id);
          });
        });
        setFound({ key, uses: programmeUses(cycles, item.programmes) });
      })
      .catch(() => {
        if (current) setFound({ key, uses: 'failed' });
      });
    return () => {
      current = false;
    };
    // `key` holds everything the result depends on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (uses === null) return <p className="hint">{texts.loading}</p>;
  if (uses === 'failed') return <p className="error">{texts.failed}</p>;
  if (uses.length === 0) return <p>{texts.none}</p>;
  const average = averageDifferencePct(uses);
  return (
    <>
      <ul className="signature-list">
        {uses.map((use) => (
          <li key={use.start}>
            <div>
              <strong>{formatLisbonDateTime(use.start)}</strong>
              <span>{programmeText(use)}</span>
            </div>
          </li>
        ))}
      </ul>
      {average !== null && <p>{texts.average(t.equipment.difference(average))}</p>}
      <p className="hint">{texts.caveat}</p>
    </>
  );
}

/** Only for an equipment with a manual's programmes, and only with a Shelly. */
export function EquipmentUses({ item, appliances }: { item: Equipment; appliances: Appliance[] }) {
  const energy = useHouseholdEnergy();
  const meter = energy.houseShelly;
  if (!meter || item.programmes.length === 0) return null;
  return (
    <section className="card">
      <h2>{texts.title}</h2>
      <p className="hint">{texts.intro(USES_DAYS)}</p>
      <Uses item={item} appliances={appliances} meter={meter} />
    </section>
  );
}
