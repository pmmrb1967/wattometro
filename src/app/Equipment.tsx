// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * "Equipamentos": the house's equipment (src/domain/equipment.ts), optional,
 * and the recognised appliances linked to each one. Linked appliances take the
 * equipment's name; the plate's power only orders and warns, never blocks.
 */
import { useMemo, useState, type FormEvent } from 'react';
import {
  ENERGY_CLASSES,
  EQUIPMENT_KINDS,
  equipmentInputSchema,
  fitsPlate,
  MAX_EQUIPMENT,
  nameKey,
  PROGRAMME_KINDS,
  type Equipment,
  type EquipmentInput,
  type EquipmentKind,
  type Programme,
} from '../domain/equipment';
import { t } from '../i18n/pt-PT';
import { isLocal } from '../local/mode';
import { formatPower } from '../lib/units';
import type { Appliance } from './api';
import { useAppliances } from './appliances-store';
import { estimateOf, fieldsOf } from './estimate-fields';
import { EstimateFieldset } from './EstimateFieldset';
import { ConsumptionEstimateCard } from './ConsumptionEstimate';
import { EquipmentPhotos } from './EquipmentPhotos';
import { EquipmentUses } from './EquipmentUses';
import { linkAppliances, removeEquipment, saveEquipment, useEquipment } from './equipment-store';
import { EMPTY_ROW, programmeOf, rowOf, type ProgrammeRow } from './programme-row';
import { failureText, useSession } from './session';

const texts = t.equipment;

const text = (value: string | null) => value ?? '';
const orNull = (value: string) => (value.trim() === '' ? null : value.trim());

function summary(item: Equipment): string {
  const parts = [
    item.kind ? texts.kinds[item.kind] : null,
    item.room,
    item.ratedPowerW === null ? null : formatPower(item.ratedPowerW),
  ].filter((part): part is string => part !== null);
  return texts.summary(parts);
}

function EquipmentForm({
  initial,
  rooms,
  onDone,
}: {
  initial: Equipment | null;
  rooms: string[];
  onDone: () => void;
}) {
  const { me, signOut } = useSession();
  const [name, setName] = useState(initial?.name ?? '');
  const [kind, setKind] = useState<EquipmentKind | ''>(initial?.kind ?? '');
  const [brand, setBrand] = useState(text(initial?.brand ?? null));
  const [model, setModel] = useState(text(initial?.model ?? null));
  const [room, setRoom] = useState(text(initial?.room ?? null));
  const [power, setPower] = useState(
    initial?.ratedPowerW === null || !initial ? '' : String(initial.ratedPowerW),
  );
  const [energyClass, setEnergyClass] = useState(initial?.energyClass ?? '');
  const [notes, setNotes] = useState(text(initial?.notes ?? null));
  const [rows, setRows] = useState<ProgrammeRow[]>((initial?.programmes ?? []).map(rowOf));
  const [estimateFields, setEstimateFields] = useState(() => fieldsOf(initial?.estimate ?? null));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const withProgrammes = kind !== '' && PROGRAMME_KINDS.includes(kind);
  const programmes = withProgrammes ? rows.map(programmeOf) : [];
  const rowsValid = programmes.every((programme) => programme !== null);
  const estimate = estimateOf(estimateFields);
  const parsed = equipmentInputSchema.safeParse({
    name,
    kind: kind === '' ? null : kind,
    brand: orNull(brand),
    model: orNull(model),
    room: orNull(room),
    ratedPowerW: power.trim() === '' ? null : Number(power),
    energyClass: energyClass === '' ? null : energyClass,
    notes: orNull(notes),
    programmes: programmes.filter((programme): programme is Programme => programme !== null),
    estimate: estimate === 'invalid' ? null : estimate,
  });
  const valid = parsed.success && rowsValid && estimate !== 'invalid';

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!parsed.success || !valid) return;
    const input: EquipmentInput = parsed.data;
    setBusy(true);
    setError(null);
    const outcome = await saveEquipment(me.householdId, initial?.id ?? null, input);
    setBusy(false);
    if (outcome.ok) {
      onDone();
      return;
    }
    if (outcome.reason === 'nameTaken') {
      setError(texts.nameTaken);
      return;
    }
    if (outcome.reason === 'tooMany') {
      setError(texts.tooMany(MAX_EQUIPMENT));
      return;
    }
    const message = failureText(outcome, texts.failed);
    if (message === null) signOut();
    else setError(message);
  }

  async function onRemove() {
    if (!initial || !window.confirm(texts.confirmRemove(initial.name))) return;
    setBusy(true);
    const outcome = await removeEquipment(me.householdId, initial.id);
    setBusy(false);
    if (outcome.ok) {
      onDone();
      return;
    }
    const message = failureText(outcome, texts.failed);
    if (message === null) signOut();
    else setError(message);
  }

  const setRow = (index: number, change: Partial<ProgrammeRow>) =>
    setRows((current) => current.map((row, at) => (at === index ? { ...row, ...change } : row)));

  return (
    <form className="form equipment-form" onSubmit={(event) => void onSubmit(event)}>
      <h2>{initial ? initial.name : texts.newTitle}</h2>
      <label>
        {texts.fields.name}
        <input
          value={name}
          maxLength={60}
          required
          placeholder={texts.fields.namePlaceholder}
          disabled={busy}
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      <EquipmentPhotos
        values={{ kind, brand, model, power, energyClass, rows, estimate: estimateFields }}
        disabled={busy}
        onApply={(next) => {
          setKind(next.kind);
          setBrand(next.brand);
          setModel(next.model);
          setPower(next.power);
          setEnergyClass(next.energyClass as typeof energyClass);
          setRows(next.rows);
          setEstimateFields(next.estimate);
        }}
      />
      <div className="equipment-fields">
        <label>
          {texts.fields.kind}
          <select
            value={kind}
            disabled={busy}
            onChange={(event) => setKind(event.target.value as EquipmentKind | '')}
          >
            <option value="">{texts.fields.noKind}</option>
            {EQUIPMENT_KINDS.map((each) => (
              <option key={each} value={each}>
                {texts.kinds[each]}
              </option>
            ))}
          </select>
        </label>
        <label>
          {texts.fields.room}
          <input
            value={room}
            maxLength={40}
            list="equipment-rooms"
            placeholder={texts.fields.roomPlaceholder}
            disabled={busy}
            onChange={(event) => setRoom(event.target.value)}
          />
          <datalist id="equipment-rooms">
            {rooms.map((each) => (
              <option key={each} value={each} />
            ))}
          </datalist>
        </label>
        <label>
          {texts.fields.brand}
          <input
            value={brand}
            maxLength={60}
            disabled={busy}
            onChange={(event) => setBrand(event.target.value)}
          />
        </label>
        <label>
          {texts.fields.model}
          <input
            value={model}
            maxLength={60}
            disabled={busy}
            onChange={(event) => setModel(event.target.value)}
          />
        </label>
        <label>
          {texts.fields.ratedPower}
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={50_000}
            value={power}
            disabled={busy}
            onChange={(event) => setPower(event.target.value)}
          />
        </label>
        <label>
          {texts.fields.energyClass}
          <select
            value={energyClass}
            disabled={busy}
            onChange={(event) => setEnergyClass(event.target.value as typeof energyClass)}
          >
            <option value="">{texts.fields.noClass}</option>
            {ENERGY_CLASSES.map((each) => (
              <option key={each} value={each}>
                {each}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="hint">{texts.fields.ratedPowerHint}</p>
      <label>
        {texts.fields.notes}
        <textarea
          value={notes}
          maxLength={500}
          rows={2}
          disabled={busy}
          onChange={(event) => setNotes(event.target.value)}
        />
      </label>

      {withProgrammes && (
        <fieldset className="programmes">
          <legend>{texts.programmes.title}</legend>
          <p className="hint">{texts.programmes.intro}</p>
          {rows.map((row, index) => (
            <div className="programme-row" key={index}>
              <label className="programme-name">
                {texts.programmes.name}
                <input
                  value={row.name}
                  maxLength={40}
                  disabled={busy}
                  onChange={(event) => setRow(index, { name: event.target.value })}
                />
              </label>
              <label>
                {texts.programmes.duration}
                <input
                  value={row.duration}
                  inputMode="numeric"
                  placeholder="1:21"
                  disabled={busy}
                  onChange={(event) => setRow(index, { duration: event.target.value })}
                />
              </label>
              <label>
                {texts.programmes.energy}
                <input
                  value={row.energy}
                  inputMode="decimal"
                  placeholder="0,458"
                  disabled={busy}
                  onChange={(event) => setRow(index, { energy: event.target.value })}
                />
              </label>
              <label>
                {texts.programmes.temperature}
                <input
                  value={row.temperature}
                  inputMode="numeric"
                  disabled={busy}
                  onChange={(event) => setRow(index, { temperature: event.target.value })}
                />
              </label>
              <label>
                {texts.programmes.load}
                <input
                  value={row.load}
                  inputMode="decimal"
                  disabled={busy}
                  onChange={(event) => setRow(index, { load: event.target.value })}
                />
              </label>
              <button
                type="button"
                className="link-button"
                disabled={busy}
                onClick={() => setRows((current) => current.filter((_, at) => at !== index))}
              >
                {texts.programmes.remove}
              </button>
            </div>
          ))}
          {!rowsValid && <p className="hint">{texts.programmes.invalid}</p>}
          <div className="actions">
            <button
              type="button"
              className="secondary"
              disabled={busy || rows.length >= 20}
              onClick={() => setRows((current) => [...current, EMPTY_ROW])}
            >
              {texts.programmes.add}
            </button>
          </div>
        </fieldset>
      )}

      <EstimateFieldset
        fields={estimateFields}
        kind={kind}
        hasPlate={power.trim() !== ''}
        disabled={busy}
        onChange={setEstimateFields}
      />

      {error && <p className="error">{error}</p>}
      <div className="actions">
        <button type="submit" className="primary" disabled={busy || !valid}>
          {texts.save}
        </button>
        <button type="button" className="secondary" disabled={busy} onClick={onDone}>
          {texts.cancel}
        </button>
      </div>
      {initial && (
        <div className="actions">
          <button
            type="button"
            className="link-button"
            disabled={busy}
            onClick={() => void onRemove()}
          >
            {texts.remove}
          </button>
        </div>
      )}
    </form>
  );
}

interface Candidate {
  label: string;
  powerW: number;
  sameName: boolean;
  fits: boolean;
}

/** The unlinked appliances by name: the same name first, then those the plate allows. */
function candidates(item: Equipment, appliances: readonly Appliance[]): Candidate[] {
  const byLabel = new Map<string, Candidate>();
  for (const appliance of appliances) {
    if (appliance.equipmentId !== null) continue;
    const known = byLabel.get(appliance.label);
    const powerW = Math.max(known?.powerW ?? 0, appliance.powerW);
    byLabel.set(appliance.label, {
      label: appliance.label,
      powerW,
      sameName: nameKey(appliance.label) === nameKey(item.name),
      fits: fitsPlate(powerW, item.ratedPowerW),
    });
  }
  const rank = (candidate: Candidate) => (candidate.sameName ? 0 : candidate.fits ? 1 : 2);
  return [...byLabel.values()].sort(
    (a, b) => rank(a) - rank(b) || a.label.localeCompare(b.label, 'pt'),
  );
}

function LinkedAppliances({ item, appliances }: { item: Equipment; appliances: Appliance[] }) {
  const { me, signOut } = useSession();
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const linked = appliances.filter((appliance) => appliance.equipmentId === item.id);
  const powers = [...new Set(linked.map((appliance) => appliance.powerW))].sort((a, b) => a - b);
  const offered = candidates(item, appliances);

  async function link() {
    setBusy(true);
    setError(null);
    const outcome = await linkAppliances(me.householdId, item.id, [...chosen]);
    setBusy(false);
    if (outcome.ok) {
      setChosen(new Set());
      return;
    }
    const message = failureText(outcome, texts.failed);
    if (message === null) signOut();
    else setError(message);
  }

  return (
    <section className="card">
      <h2>{texts.linked.title}</h2>
      <p className="hint">{texts.linked.intro}</p>
      {linked.length === 0 ? (
        <p>{texts.linked.none}</p>
      ) : (
        <ul className="signature-list">
          {powers.map((powerW) => (
            <li key={powerW}>
              <div>
                <strong>{item.name}</strong> {formatPower(powerW)}
              </div>
            </li>
          ))}
        </ul>
      )}
      {offered.length === 0 ? (
        <p className="hint">{texts.linked.noneToLink}</p>
      ) : (
        <fieldset className="form link-choices">
          <legend>{texts.linked.choose}</legend>
          {offered.map((candidate) => (
            <label className="checkbox" key={candidate.label}>
              <input
                type="checkbox"
                checked={chosen.has(candidate.label)}
                disabled={busy}
                onChange={(event) =>
                  setChosen((current) => {
                    const next = new Set(current);
                    if (event.target.checked) next.add(candidate.label);
                    else next.delete(candidate.label);
                    return next;
                  })
                }
              />
              <span>
                {candidate.label} {formatPower(candidate.powerW)}
                {candidate.sameName && <span className="hint"> ({texts.linked.sameName})</span>}
                {!candidate.fits && <span className="hint"> ({texts.linked.overPlate})</span>}
              </span>
            </label>
          ))}
          {error && <p className="error">{error}</p>}
          <div className="actions">
            <button
              type="button"
              className="primary"
              disabled={busy || chosen.size === 0}
              onClick={() => void link()}
            >
              {texts.linked.link}
            </button>
          </div>
        </fieldset>
      )}
    </section>
  );
}

export function EquipmentPage() {
  const { me } = useSession();
  const register = useEquipment(me.householdId);
  const known = useAppliances(me.householdId);
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const items = useMemo(() => (register.kind === 'ready' ? register.items : []), [register]);
  const appliances = known.kind === 'ready' ? known.appliances : [];
  const rooms = useMemo(
    () =>
      [...new Set(items.flatMap((item) => (item.room === null ? [] : [item.room])))].sort((a, b) =>
        a.localeCompare(b, 'pt'),
      ),
    [items],
  );
  const current = items.find((item) => item.id === editing) ?? null;

  return (
    <>
      <h1>{texts.title}</h1>
      <p className="lead">{texts.intro}</p>
      {register.kind === 'error' && <p className="error">{texts.failed}</p>}

      {editing === null ? (
        <section className="card">
          <h2>{texts.listTitle}</h2>
          {register.kind === 'ready' && items.length === 0 && <p>{texts.empty}</p>}
          {items.length > 0 && (
            <ul className="signature-list">
              {items.map((item) => (
                <li key={item.id}>
                  <div>
                    <strong>{item.name}</strong>
                    {summary(item) !== '' && <p className="hint">{summary(item)}</p>}
                  </div>
                  <button type="button" className="link-button" onClick={() => setEditing(item.id)}>
                    {texts.edit}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="actions">
            <button
              type="button"
              className="primary"
              disabled={register.kind !== 'ready'}
              onClick={() => setEditing('new')}
            >
              {texts.add}
            </button>
          </div>
        </section>
      ) : (
        <section className="card">
          <EquipmentForm
            key={editing}
            initial={current}
            rooms={rooms}
            onDone={() => setEditing(null)}
          />
        </section>
      )}

      {current && editing !== 'new' && (
        <>
          {isLocal() ? (
            <p className="hint">{texts.linked.noShelly}</p>
          ) : (
            <LinkedAppliances item={current} appliances={appliances} />
          )}
          <EquipmentUses item={current} appliances={appliances} />
        </>
      )}
      {editing === null && register.kind === 'ready' && <ConsumptionEstimateCard items={items} />}
    </>
  );
}
