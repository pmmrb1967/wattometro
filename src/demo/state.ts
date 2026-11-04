// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * What the demonstration remembers while it lasts: the fictional household
 * (model.ts) and the changes made to it (tariff, zone, locality, equipment…).
 * resetDemo forgets them. Read by server.ts.
 */
import { type AlwaysOnItem } from '../domain/always-on';
import { addDays } from '../domain/consumption';
import { type Budget } from '../domain/budget';
import { nameKey, type Equipment } from '../domain/equipment';
import { type HouseholdLocation } from '../domain/location';
import { type Installation } from '../domain/installation';
import { type Tariff } from '../domain/tariff';
import { lisbonDate, lisbonToday, startOfLisbonDay } from '../lib/time';
import { generateDemo, type DemoData } from './model';

export const MINUTE = 60;

export const DAY = 86_400;

export const DEVICE_ID = 'demo-shelly';

export const METER = `${DEVICE_ID}:0`;

export const DEMO_ME = {
  email: 'demonstracao@wattometro',
  householdId: 'demo',
  householdName: 'Casa de exemplo',
  admin: false,
};

export interface DemoState {
  data: DemoData;
  tariffs: Tariff[];
  zone: 'A' | 'B' | 'C' | null;
  location: DemoLocation | null;
  installation: Installation;
  budget: Budget | null;
  excluded: Set<number>;
  signatures: DemoSignature[];
  appliances: DemoAppliance[];
  alwaysOn: AlwaysOnItem[];
  equipment: Equipment[];
  /** PUT /v1/nilm/days, by day (the browser's own encoding). */
  nilmDays: Map<string, { day: string; version: number; minutes: number; data: string }>;
}

interface DemoAppliance {
  id: string;
  label: string;
  powerW: number;
  statesW: number[];
  pulsing: boolean;
  minDurationS: number | null;
  maxDurationS: number | null;
  heats: number | null;
  periodS: number | null;
  equipmentId: string | null;
  createdAt: number;
}

/** A descriptor as the server accepts it (server/src/app.ts, ApplianceBody). */
export function applianceInput(
  value: unknown,
): Omit<DemoAppliance, 'id' | 'equipmentId' | 'createdAt'> | null {
  if (typeof value !== 'object' || value === null) return null;
  const { label, powerW, statesW, pulsing, minDurationS, maxDurationS, heats, periodS } =
    value as Record<string, unknown>;
  const name = typeof label === 'string' ? label.trim() : '';
  if (name === '' || name.length > 60 || !Number.isInteger(powerW) || (powerW as number) < 1) {
    return null;
  }
  if (!Array.isArray(statesW) || statesW.length === 0 || !statesW.every(Number.isInteger)) {
    return null;
  }
  if (typeof pulsing !== 'boolean') return null;
  const rhythm = periodS ?? null;
  if (
    rhythm !== null &&
    (!Number.isInteger(rhythm) || (rhythm as number) < 1 || (rhythm as number) > 600)
  ) {
    return null;
  }
  const heatings = heats ?? null;
  if (heatings !== null && (!Number.isInteger(heatings) || (heatings as number) < 1)) return null;
  const min = minDurationS ?? null;
  const max = maxDurationS ?? null;
  if ((min === null) !== (max === null)) return null;
  if (
    min !== null &&
    (!Number.isInteger(min) || !Number.isInteger(max) || (min as number) > (max as number))
  ) {
    return null;
  }
  return {
    label: name,
    powerW: powerW as number,
    statesW: statesW as number[],
    pulsing,
    minDurationS: min as number | null,
    maxDurationS: max as number | null,
    heats: heatings as number | null,
    periodS: rhythm as number | null,
  };
}

export interface DemoSignature {
  id: string;
  label: string;
  from: number;
  to: number;
  createdAt: number;
}

type DemoLocation = HouseholdLocation;

const DEMO_LOCATION: DemoLocation = { name: 'Lisboa', latitudeCdeg: 3872, longitudeCdeg: -914 };

/** As src/demo/model.ts draws it: electric water heater, no heating on electricity. */
const DEMO_INSTALLATION: Installation = {
  heating: ['gas-boiler'],
  airConditioning: false,
  waterHeating: 'electric',
  hob: 'electric',
  solarPanels: false,
  electricCar: false,
};

let state: DemoState | null = null;

/**
 * The regulated tariff (TUR) at 10,35 kVA, simple, as in the ERSE offers of
 * October 2026: the "Potência" page finds the same price there for 6,9 kVA.
 */
function demoTariff(data: DemoData): Tariff {
  return {
    id: 'demo-tariff',
    validFrom: lisbonDate(data.start),
    supplier: 'TUR',
    powerVa: 10_350,
    option: 'simple',
    cycle: 'daily',
    periodsMap: 'pre-2027',
    fixedPerDay: 539_700,
    energy: { simple: 171_100 },
    iecPerKwh: 1_000,
    cavPerMonth: 2_850_000,
    dgegPerMonth: 70_000,
    largeFamily: false,
    energyDiscountBp: 0,
    socialEnergyPerKwh: 0,
    socialPowerPerDay: 0,
    socialFinancingPerKwh: 0,
  };
}

export function current(): DemoState {
  if (!state) {
    const data = generateDemo(Math.floor(Date.now() / 1000));
    state = {
      data,
      tariffs: [demoTariff(data)],
      zone: 'B',
      location: DEMO_LOCATION,
      installation: DEMO_INSTALLATION,
      budget: null,
      excluded: new Set(),
      signatures: demoSignatures(),
      appliances: [],
      alwaysOn: demoAlwaysOn(),
      equipment: demoEquipment(),
      nilmDays: new Map(),
    };
  }
  return state;
}

/** Invented, like the rest of the example house. */
function demoAlwaysOn(): AlwaysOnItem[] {
  const createdAt = Math.floor(Date.now() / 1000);
  return [
    { id: 'demo-on-1', label: 'Router', quantity: 1, powerW: 12, measured: true, createdAt },
    {
      id: 'demo-on-2',
      label: 'Televisões em espera',
      quantity: 2,
      powerW: null,
      measured: false,
      createdAt,
    },
  ];
}

/** Invented too: no real model, the manual's values only an example. */
function demoEquipment(): Equipment[] {
  const createdAt = Math.floor(Date.now() / 1000);
  const none = {
    brand: null,
    model: null,
    energyClass: null,
    notes: null,
    programmes: [],
    estimate: null,
  };
  return [
    {
      ...none,
      id: 'demo-eq-washer',
      name: 'Máquina da roupa',
      kind: 'washer',
      brand: 'Exemplo',
      room: 'Lavandaria',
      ratedPowerW: 2100,
      programmes: [
        { name: 'Mix', durationS: 4860, energyWh: 458, temperatureC: 40, loadKg: 4 },
        { name: 'Eco 40-60', durationS: 13_680, energyWh: 1011, temperatureC: 40, loadKg: 9 },
      ],
      estimate: { basis: 'cycles100', labelWh: 58_000, cyclesPerWeek: 4 },
      createdAt,
    },
    {
      ...none,
      id: 'demo-eq-fridge',
      name: 'Frigorífico',
      kind: 'fridge',
      room: 'Cozinha',
      ratedPowerW: null,
      energyClass: 'E',
      estimate: { basis: 'year', labelWh: 250_000 },
      createdAt,
    },
    {
      ...none,
      id: 'demo-eq-kettle',
      name: 'Chaleira',
      kind: 'kettle',
      room: 'Cozinha',
      ratedPowerW: 2200,
      estimate: { basis: 'plate', minutesPerDay: 10 },
      createdAt,
    },
  ];
}

/** Gives an equipment's name to its appliances and to their calibrations, as the server does. */
export function renameLinked(
  demo: DemoState,
  equipmentId: string,
  name: string,
  oldNames: readonly string[] = [],
) {
  const linked = demo.appliances.filter((item) => item.equipmentId === equipmentId);
  renameSignatures(demo, [...linked.map((item) => item.label), ...oldNames], name);
  for (const appliance of linked) appliance.label = name;
}

/** Calibrations named one of `labels` in any case take `name`. */
export function renameSignatures(demo: DemoState, labels: readonly string[], name: string) {
  const keys = new Set(labels.map(nameKey));
  for (const signature of demo.signatures) {
    if (keys.has(nameKey(signature.label))) signature.label = name;
  }
}

export const isLinkedLabel = (demo: DemoState, label: string) =>
  demo.appliances.some(
    (item) => nameKey(item.label) === nameKey(label) && item.equipmentId !== null,
  );

/** One calibration already made: the dishwasher of yesterday evening (src/demo/model.ts). */
function demoSignatures(): DemoSignature[] {
  // As the model counts it: 22 h 30 after midnight (21:30 on the day the clocks go back).
  const from = startOfLisbonDay(addDays(lisbonToday(), -1)) + (22 * 60 + 30) * MINUTE;
  return [
    {
      id: 'demo-dishwasher',
      label: 'Máquina da loiça',
      from,
      to: from + 25 * MINUTE,
      createdAt: from + 30 * MINUTE,
    },
  ];
}

/** The minutes a signature keeps, as on the server: whole minutes, one more on each side. */
export function signatureRange(signature: { from: number; to: number }): [number, number] {
  return [
    Math.floor(signature.from / MINUTE) * MINUTE - MINUTE,
    Math.ceil(signature.to / MINUTE) * MINUTE + MINUTE,
  ];
}

/** Forgets the household and its changes (when the demonstration ends). */
export function resetDemo(): void {
  state = null;
}
