// SPDX-License-Identifier: AGPL-3.0-or-later
/** The meter (or the house) whose data a page shows; nothing when there is no choice. */
import type { HouseholdEnergy } from './household-energy';
import { meterLabel } from './meters';
import { useSession } from './session';

export function MeterSelect({
  energy: { choices, devices, meter, setMeter, houseShelly },
  label,
}: {
  energy: Pick<HouseholdEnergy, 'choices' | 'devices' | 'meter' | 'setMeter' | 'houseShelly'>;
  label: string;
}) {
  const { me } = useSession();
  if (choices.length < 2) return null;
  return (
    <label>
      {label}
      <select value={meter ?? ''} onChange={(event) => setMeter(event.target.value)}>
        {choices.map((choice) => (
          <option key={choice} value={choice}>
            {meterLabel(choice, devices, houseShelly, me.householdName)}
          </option>
        ))}
      </select>
    </label>
  );
}
