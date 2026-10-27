// SPDX-License-Identifier: AGPL-3.0-or-later
import { useEffect, useState } from 'react';
import { lisbonToday } from '../lib/time';
import type { RecentAppliances as Recent } from '../nilm/recent';
import { useAppliances } from './appliances-store';
import type { HouseholdEnergy } from './household-energy';
import { loadRecentAppliances } from './recent-appliances';
import { useSession } from './session';

type Loaded = { key: string; recent: Recent | null };

/**
 * The last days' named appliances (also for "Tarifários"): `active` false
 * without a Shelly on the board or named appliances; `recent` undefined while
 * it works, null when it failed.
 */
export function useRecentAppliances(energy: HouseholdEnergy): {
  active: boolean;
  recent: Recent | null | undefined;
} {
  const { me } = useSession();
  const meter = energy.houseShelly;
  const [today] = useState(lisbonToday);
  const known = useAppliances(me.householdId);
  const appliances = known.kind === 'ready' ? known.appliances : null;
  const tariffs = energy.tariffs;
  const waiting = tariffs === null && !energy.tariffsFailed;
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const key = JSON.stringify([meter, today, energy.shellyFrom, tariffs, appliances]);

  useEffect(() => {
    if (!meter || !appliances || appliances.length === 0 || waiting) return;
    let current = true;
    void loadRecentAppliances({
      householdId: me.householdId,
      meter,
      today,
      shellyFrom: energy.shellyFrom,
      tariffs,
      appliances,
    }).then((recent) => {
      if (current) setLoaded({ key, recent });
    });
    return () => {
      current = false;
    };
  }, [key, me.householdId, meter, today, energy.shellyFrom, tariffs, appliances, waiting]);

  const active = Boolean(meter && appliances && appliances.length > 0);
  return { active, recent: active && loaded?.key === key ? loaded.recent : undefined };
}
