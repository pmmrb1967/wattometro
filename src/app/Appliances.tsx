// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * "Consumo › Aparelhos": what the named appliances cost over the last days and
 * a day of per-second values ("Ao segundo"), where they are named. Apart from
 * "Consumo" so that page stays about the house as a whole.
 */
import { t } from '../i18n/pt-PT';
import { ConsumptionTabs } from './ConsumptionTabs';
import { DayEvents } from './DayEvents';
import { useHouseholdEnergy } from './household-energy';
import { RecentAppliances } from './RecentAppliances';

const texts = t.appliancesPage;

export function Appliances() {
  const energy = useHouseholdEnergy();
  return (
    <>
      <h1>{texts.title}</h1>
      <ConsumptionTabs appliances />
      <p className="lead">{texts.intro}</p>
      {energy.error && <p className="error">{energy.error}</p>}
      {!energy.error && !energy.houseShelly && energy.meters !== null && <p>{texts.noShelly}</p>}
      <RecentAppliances energy={energy} />
      <DayEvents energy={energy} />
    </>
  );
}
