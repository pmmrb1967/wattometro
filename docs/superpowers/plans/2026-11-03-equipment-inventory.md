# Equipamentos da casa (fases 1 e 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An optional register of the house's equipment, linked to the appliances the app recognises, with the plate's power as a ceiling when naming, and the manual's programmes to tell the likely programme of each wash and its energy against the manual.

**Architecture:** Pure domain code in `src/domain/equipment.ts` and `src/domain/equipment-programmes.ts` (schemas, the plate ceiling, the likely programme). One new D1 table `equipment` (migration 0026) plus `appliances.equipment_id`, behind `server/src/repo/equipment.ts`; routes `/v1/equipment…` answered the same way by the Worker, `src/local/server.ts` and `src/demo/server.ts`. A store `src/app/equipment-store.ts` like `appliances-store.ts`, a page `/equipamentos`, and small changes where appliances are named.

**Tech Stack:** TypeScript strict, React 18, Hono, D1 (SQLite in tests via `server/test/sqlite.ts`), zod, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-03-equipment-inventory-design.md`

## Global Constraints

- Code, names and comments in English; text the user sees in pt-PT (pós-AO90, "tu") in `src/i18n/pt-PT.ts`.
- `// SPDX-License-Identifier: AGPL-3.0-or-later` on every code file (`--` in SQL).
- Integers only: power W, energy **Wh** (0,458 kWh → 458), durations in seconds. Formatting through `src/lib/units.ts` (`formatPower`, `formatKwh`) and `src/lib/time.ts` (`formatDuration`).
- No `any`; everything from outside (request bodies, IndexedDB, API responses) validated with zod.
- SQL only in `server/src/repo/`; every table row carries `household_id`; routes under `/v1/`.
- No new external connection; no AI; no images stored anywhere.
- New migration file only (never edit an applied one): `server/migrations/0026_equipment.sql`.
- Local format: `LOCAL_VERSION` 2 → 3 with a step in `MIGRATIONS` (`src/local/stored.ts`), so old copies restore.
- Limits: `MAX_EQUIPMENT = 100` per household; `MAX_PROGRAMMES = 20` per equipment.
- Equipment names are unique per household, compared with `name.trim().toLocaleLowerCase('pt')`.
- Plate ceiling: compatible when `powerW230 <= ratedPowerW * 1.1`, or when there is no plate power. Never blocks.
- Likely programme: closest duration, only if `|duration − programme| <= 25 %` of the programme's; energy difference in whole percent, rounded.
- Programmes only for kinds `washer` and `dishwasher`, and matched only against whole programmes (cycles with `heats`).
- No serial number field. No "a crescer"/"desgaste" conclusion.
- Before a task is done: `pnpm typecheck && pnpm lint && pnpm test` pass. Commits small, Conventional Commits, ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Commit only; push only when the user asks.

## Review Focus

1. **Renaming an equipment to a name another equipment has** (any case, with accents): refused with 409 `name_taken` in all three servers, and the form says so; nothing renamed halfway. Test in Task 3 and Task 5.
2. **Renaming a linked equipment**: the old name disappears everywhere at once (appliances, calibrations, "Ao segundo"), including descriptors linked under another old name (the heater's "Aquecedor 1R"/"2R"). Test in Task 3.
3. **Deleting an equipment with linked appliances**: the appliances stay, unlinked, with their current name; cycles keep being recognised. Test in Task 3.
4. **An old local copy (version 2) restored**: opens with an empty register, nothing else lost. Test in Task 5.
5. **A plate typed wrong** (too low): naming still works; the equipment shows with a warning, not hidden. Test in Task 7.

---

### Task 1: Equipment domain

**Files:**
- Create: `src/domain/equipment.ts`
- Test: `src/domain/equipment.test.ts`

**Interfaces:**
- Produces:
  - `EQUIPMENT_KINDS = ['washer','dishwasher','dryer','fridge','freezer','oven','hob','microwave','airfryer','kettle','coffee','heater','air_conditioner','water_heater','ev_charger','tv','computer','other'] as const`; `type EquipmentKind`
  - `PROGRAMME_KINDS: readonly EquipmentKind[] = ['washer','dishwasher']`
  - `MAX_EQUIPMENT = 100`, `MAX_PROGRAMMES = 20`, `PLATE_MARGIN = 1.1`
  - `programmeSchema = z.object({ name: string 1..40 trimmed, durationS: int 60..86_400, energyWh: int 0..20_000, temperatureC: int 0..95 nullable, loadKg: number 0..20 multipleOf 0.5 nullable })`; `type Programme`
  - `equipmentInputSchema = z.object({ name: string trim 1..60, kind: z.enum(EQUIPMENT_KINDS).nullable(), brand: string trim max 60 nullable, model: string trim max 60 nullable, room: string trim max 40 nullable, ratedPowerW: int 1..50_000 nullable, energyClass: z.enum(['A','B','C','D','E','F','G']).nullable(), notes: string max 500 nullable, programmes: z.array(programmeSchema).max(MAX_PROGRAMMES) })` refined: `programmes.length === 0 || PROGRAMME_KINDS.includes(kind)`; `type EquipmentInput`
  - `equipmentSchema = equipmentInputSchema.and(z.object({ id: z.string(), createdAt: z.number().int() }))`; `type Equipment`
  - `nameKey(name: string): string` — `name.trim().toLocaleLowerCase('pt')`
  - `fitsPlate(powerW230: number, ratedPowerW: number | null): boolean` — in integers, `powerW230 * 10 <= ratedPowerW * 11` (no float at the boundary)

- [ ] **Step 1: Write the failing tests** in `src/domain/equipment.test.ts`:
  - `fitsPlate`: `fitsPlate(2084, 2200)` true (the airfryer, 95 %); `fitsPlate(1961, 2100)` true (the washer, 93 %); `fitsPlate(2310, 2100)` true (exactly 110 %); `fitsPlate(2311, 2100)` false; `fitsPlate(5000, null)` true.
  - `nameKey('  Máquina da Roupa ')` equals `nameKey('máquina da roupa')`.
  - `equipmentInputSchema` accepts `{ name: 'Máquina da roupa', kind: 'washer', brand: 'LG', model: 'F4WV5009S0W', room: 'Lavandaria', ratedPowerW: 2100, energyClass: null, notes: null, programmes: [{ name: 'Mix', durationS: 4860, energyWh: 458, temperatureC: 35, loadKg: 4 }] }`; refuses the same with `kind: 'airfryer'` (programmes on a kind without them), with `name: ' '`, and with 21 programmes.
- [ ] **Step 2:** `pnpm exec vitest run src/domain/equipment.test.ts` → FAIL (module not found).
- [ ] **Step 3:** Implement the exports above.
- [ ] **Step 4:** Same command → PASS.
- [ ] **Step 5:** Commit `feat(equipment): the domain of the house's equipment`.

### Task 2: Likely programme and energy against the manual

**Files:**
- Create: `src/domain/equipment-programmes.ts`
- Test: `src/domain/equipment-programmes.test.ts`

**Interfaces:**
- Consumes: `Programme` (Task 1).
- Produces:
  - `PROGRAMME_TOLERANCE = 0.25`
  - `likelyProgramme(durationS: number, programmes: readonly Programme[]): Programme | null` — the closest duration within the tolerance of that programme's duration; on a tie, the first in the list.
  - `energyDifferencePct(measuredWh: number, manualWh: number): number | null` — `Math.round((measured − manual) / manual × 100)`; null when `manualWh === 0`.
  - `interface ProgrammeUse { start: number; durationS: number; energyWh: number; programme: Programme | null; differencePct: number | null }`
  - `programmeUses(cycles: readonly { start: number; durationS: number; energyWh: number; heats?: unknown }[], programmes: readonly Programme[]): ProgrammeUse[]` — only cycles with `heats`, latest first.
  - `averageDifferencePct(uses: readonly ProgrammeUse[]): number | null` — mean of the non-null differences, rounded; null when none.

- [ ] **Step 1: Write the failing tests**, with the LG manual (`fixtures`-free, values copied here): Mix 4860 s/458 Wh, Algodão 20 °C 6660 s/177 Wh, 14 Minutos 840 s/46 Wh, Eco 40-60 total 13680 s/1011 Wh:
  - a wash of 5400 s, 570 Wh → Mix (|5400−4860| = 540 ≤ 1215), `energyDifferencePct(570, 458) === 24`;
  - 5340 s, 535 Wh → Mix, 17;
  - 3300 s (the cut programme of 02/11) → null ("programa não identificado"): Mix is 32 % away, 14 Minutos too;
  - 13000 s → Eco 40-60;
  - `programmeUses` ignores a cycle without `heats` and orders latest first;
  - `averageDifferencePct` of uses with 24, 17 and one null → 21 (`Math.round(20.5)`).
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3:** implement.
- [ ] **Step 4:** run → PASS.
- [ ] **Step 5:** Commit `feat(equipment): the likely programme of a wash and its energy against the manual`.

### Task 3: Server: table, repository, routes and links

**Files:**
- Create: `server/migrations/0026_equipment.sql`, `server/src/repo/equipment.ts`, `server/src/equipment.test.ts`
- Modify: `server/src/repo/appliances.ts` (select and return `equipment_id`; on create, link to the equipment with the same `name_key`), `server/src/repo/signatures.ts` (`renameSignature` refuses a label that is a linked equipment's), `server/src/app.ts` (routes, header comment, bodies from `equipmentInputSchema`)

**Interfaces:**
- Consumes: `equipmentInputSchema`, `nameKey`, `MAX_EQUIPMENT` (Task 1, imported from `../../src/domain/equipment` as `alerts.ts` imports from `src/`).
- Produces (HTTP, same in Tasks 5):
  - `GET /v1/equipment` → `{ items: Equipment[] }` ordered by name
  - `POST /v1/equipment` body `EquipmentInput` → `201 { item }`; `409 { error: 'too_many' }`; `409 { error: 'name_taken' }`
  - `PUT /v1/equipment/:id` body `EquipmentInput` → `204`; `404`; `409 name_taken`. When the name changes, in one batch: every appliance with this `equipment_id` and every signature whose label was one of those appliances' labels get the new name.
  - `POST /v1/equipment/:id/link` body `{ labels: string[] (1..20) }` → `204`; `404`. Every appliance of the household whose label matches one of `labels` (by `nameKey`) gets `equipment_id` and the equipment's name; signatures with those labels get the name too.
  - `DELETE /v1/equipment/:id` → `204`; linked appliances get `equipment_id = NULL` and keep their label.
  - `GET /v1/appliances` items gain `equipmentId: string | null`.
  - `PATCH /v1/appliances/:id` with a `label` on a linked appliance → `409 { error: 'linked' }`; `PATCH /v1/signatures/:id` to or from a label of a linked appliance → `409 linked`.
  - `POST /v1/appliances` with a label whose `nameKey` is an equipment's → stored with that `equipment_id` and the equipment's exact name.

Migration (decided here: one row per equipment, programmes as JSON; `name_key` because SQLite's `lower()` does not fold "Á"):

```sql
-- SPDX-License-Identifier: AGPL-3.0-or-later
-- The house's equipment (docs/superpowers/specs/2026-11-03-equipment-inventory-design.md):
-- what the user says they have, optional, to help name what the Shelly sees.
CREATE TABLE equipment (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  -- name trimmed and lower-cased in Portuguese (src/domain/equipment.ts nameKey).
  name_key TEXT NOT NULL,
  kind TEXT,
  brand TEXT,
  model TEXT,
  room TEXT,
  rated_power_w INTEGER,
  energy_class TEXT,
  notes TEXT,
  -- The manual's programmes, a JSON array (src/domain/equipment.ts programmeSchema).
  programmes TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX equipment_name ON equipment (household_id, name_key);
ALTER TABLE appliances ADD COLUMN equipment_id TEXT REFERENCES equipment (id) ON DELETE SET NULL;
```

- [ ] **Step 1: Write the failing tests** in `server/src/equipment.test.ts` (setup as in `server/src/always-on.test.ts`, two households; appliances created through `POST /v1/appliances`, signatures through `minuteStatements` + `POST /v1/signatures` as in `signatures.test.ts`):
  - create, list, update, delete round trip; another household sees and changes nothing (404);
  - `POST` with name `'máquina da ROUPA'` after `'Máquina da roupa'` → 409 `name_taken`; `PUT` to another equipment's name → 409, and nothing changed;
  - 101st equipment → 409 `too_many`;
  - link `['Aquecedor 1R', 'Aquecedor 2R']` to "Aquecedor": both appliances now `label: 'Aquecedor'`, `equipmentId` set; signatures "Aquecedor 1R" renamed too;
  - rename the equipment to "Aquecedor da sala": appliances and signatures follow;
  - delete it: appliances keep "Aquecedor da sala", `equipmentId: null`;
  - `POST /v1/appliances` label "aquecedor" while an equipment "Aquecedor" exists → `equipmentId` set, label "Aquecedor";
  - `PATCH /v1/appliances/:id {label}` on a linked one → 409 `linked`; `PATCH /v1/signatures/:id` on a linked label → 409 `linked`.
- [ ] **Step 2:** `pnpm exec vitest run server/src/equipment.test.ts` → FAIL.
- [ ] **Step 3:** Implement migration, `server/src/repo/equipment.ts` (`listEquipment`, `createEquipment` → `Equipment | 'too_many' | 'name_taken'`, `updateEquipment` → `'ok' | 'not_found' | 'name_taken'`, `linkEquipment` → `boolean`, `deleteEquipment`), the appliance and signature changes, the routes and the header comment of `app.ts`.
- [ ] **Step 4:** run the new file and `server/src/appliances.test.ts`, `server/src/signatures.test.ts` → PASS.
- [ ] **Step 5:** Commit `feat(equipment): keep the house's equipment and link appliances to it`.

### Task 4: Client API and store

**Files:**
- Modify: `src/app/api.ts` (Appliance schema gains `equipmentId: z.string().nullable().default(null)`; equipment calls), `src/app/appliances-store.ts` (export `reloadAppliances(householdId: string): void`)
- Create: `src/app/equipment-store.ts`

**Interfaces:**
- Consumes: HTTP of Task 3; `equipmentSchema`, `EquipmentInput` (Task 1).
- Produces:
  - `api.ts`: `fetchEquipment(): Promise<{ ok: true; items: Equipment[] } | Failure>`, `createEquipment(input): Promise<{ ok: true; item: Equipment } | { ok: false; reason: 'nameTaken' } | Failure>`, `updateEquipment(id, input): Promise<{ ok: true } | { ok: false; reason: 'nameTaken' } | Failure>`, `linkEquipment(id, labels: string[]): Promise<{ ok: true } | Failure>`, `deleteEquipment(id): Promise<{ ok: true } | Failure>`. `too_many` maps as `failureText` already does for other lists.
  - `equipment-store.ts`: `useEquipment(householdId: string): { kind: 'loading' } | { kind: 'ready'; items: Equipment[] } | { kind: 'error' }`, and `saveEquipment(id: string | null, input)`, `linkAppliances(id, labels)`, `removeEquipment(id)`, each returning the api outcome and, on success, updating the list and calling `reloadAppliances` (names and links changed there).
- [ ] **Step 1:** Typecheck-driven: add the functions; there is no unit test file for `api.ts` in the repository; behaviour is covered by Task 5 (local/demo servers) and the e2e check in Task 9.
- [ ] **Step 2:** `pnpm typecheck` → PASS.
- [ ] **Step 3:** Commit `feat(equipment): client calls and store`.

### Task 5: Local mode and demonstration

**Files:**
- Modify: `src/local/data.ts` (`LOCAL_VERSION = 3`, `equipment: z.array(equipmentSchema)`, empty default), `src/local/stored.ts` (`2: (old) => ({ ...old, equipment: [] })`), `src/local/server.ts`, `src/demo/server.ts`
- Test: `src/local/server.test.ts`, `src/local/stored.test.ts`, `src/demo/demo.test.ts`

**Interfaces:**
- Consumes: HTTP contract of Task 3 (same answers and errors); Task 1 schemas.
- Produces: local and demo answers for all `/v1/equipment` routes. Local mode has no appliances: `link` answers 204 and changes nothing. Demo: three sample items, "Máquina da roupa" (washer, LG-like data without a real model: brand "Exemplo", rated 2100 W, programmes Mix 4860 s/458 Wh and Eco 40-60 13680 s/1011 Wh), "Frigorífico" (fridge), "Chaleira" (kettle, 2200 W); demo naming and renaming follow the same linking rules as the server.
- [ ] **Step 1: Write the failing tests:** local CRUD with `name_taken` (case and accent), the 101st refused; a version-2 house read by `readStored` comes back with `equipment: []` and its tariffs intact; demo lists the three samples and refuses a duplicate name.
- [ ] **Step 2:** run the three files → FAIL.
- [ ] **Step 3:** implement.
- [ ] **Step 4:** run → PASS; also `src/local/backup.test.ts`.
- [ ] **Step 5:** Commit `feat(equipment): the register without an account and in the demonstration`.

### Task 6: The "Equipamentos" page

**Files:**
- Create: `src/app/Equipment.tsx`
- Modify: `src/app/router.tsx` (`{ path: 'equipamentos', element: <EquipmentPage /> }`), `src/app/Appliances.tsx` (link "Os teus equipamentos"), `src/app/Settings.tsx` (link in the "casa" group, account and local), `src/i18n/pt-PT.ts` (`t.equipment`), `src/index.css` (only if the existing `.card`/`.form`/`.signature-list` do not cover it)

**Interfaces:**
- Consumes: `useEquipment`, `saveEquipment`, `linkAppliances`, `removeEquipment` (Task 4); `useAppliances` (existing); `EQUIPMENT_KINDS`, `PROGRAMME_KINDS`, `nameKey` (Task 1).
- Produces: the page. Behaviour pinned here:
  - intro text says it is optional and helps the app tell appliances apart (copy: "Opcional. Ajuda a app a reconhecer os aparelhos nas medições: o nome, a divisão e a potência da chapa já chegam.");
  - list of equipment: name, kind, room, plate power; each opens its form; empty state invites adding one;
  - form: all fields of `EquipmentInput`; room with a `datalist` of the rooms already used; programmes table only when the kind is in `PROGRAMME_KINDS` (duration typed as h:mm, energy as kWh with 3 decimals, converted to s and Wh through `src/lib/units.ts`/`src/lib/time.ts` helpers, adding them there if missing, with tests);
  - "Aparelhos reconhecidos": the linked appliance labels with their powers; and, from unlinked appliance labels, a choice to link (several at once, different names allowed); a label equal by `nameKey` is offered first;
  - delete asks for confirmation and says the appliances stay;
  - errors: `nameTaken` → "Já tens um equipamento com esse nome."
- [ ] **Step 1:** If a units/time helper is added (h:mm ↔ s, kWh text ↔ Wh), write its test first in `src/lib/units.test.ts`/`src/lib/time.test.ts` with "1:21" → 4860 and "0,458" → 458, and see it fail.
- [ ] **Step 2:** implement helpers → PASS; build the page.
- [ ] **Step 3:** Visual check on the demonstration (`pnpm exec vite`, "Ver demonstração", `/equipamentos`), desktop and 390 px wide: no horizontal scroll; close the browser and stop the server after.
- [ ] **Step 4:** `pnpm typecheck && pnpm lint && pnpm test` → PASS.
- [ ] **Step 5:** Commit `feat(equipment): a page for the house's equipment`.

### Task 7: Naming with the register

**Files:**
- Modify: `src/app/DayEvents.tsx` (`NameGroup`), `src/app/KnownAppliances.tsx`, `src/app/Calibrate.tsx` (`SignatureName`, new "Por calibrar" card), `src/i18n/pt-PT.ts`
- Create: `src/domain/equipment-suggest.ts`, `src/domain/equipment-suggest.test.ts`

**Interfaces:**
- Consumes: `fitsPlate`, `nameKey` (Task 1); `useEquipment` (Task 4); `Appliance.equipmentId` (Task 4).
- Produces:
  - `suggestEquipment(powerW230: number, items: readonly Equipment[]): { item: Equipment; fits: boolean }[]` — fitting first, then the others, each part by name (`localeCompare` 'pt').
  - `uncalibrated(items: readonly Equipment[], appliances: readonly { equipmentId: string | null }[]): Equipment[]`.
  - `NameGroup`: the input gets a `datalist` of `suggestEquipment(...)` names (fitting ones first); when the typed name is an equipment's that does not fit, a warning under the field: "A chapa de "{name}" diz {power}: este grupo tem {power}. Guarda na mesma se tens a certeza." Saving works as today (the server links by name).
  - `KnownAppliances` and `SignatureName`: a linked appliance (or a signature whose label is a linked appliance's) shows the name as text with a link "Ver equipamento" to `/equipamentos`, no field.
  - `Calibrate`: a card "Por calibrar" listing `uncalibrated(...)` names, hidden when empty or when the house has no Shelly.
- [ ] **Step 1: Write the failing tests** for `suggestEquipment` (group 2084 W with airfryer 2200 W, washer 2100 W, kettle 1500 W → airfryer and washer fit, kettle after with `fits: false`) and `uncalibrated`.
- [ ] **Step 2:** run → FAIL. **Step 3:** implement and wire the UI. **Step 4:** checks → PASS; visual check in the demonstration (name a group "Chaleira" with a plate below it: warning shows, saving works); close the browser.
- [ ] **Step 5:** Commit `feat(equipment): name appliances from the register`.

### Task 8: The likely programme in the app

**Files:**
- Modify: `src/app/DayEvents.tsx` (a single whole-programme group of a linked equipment with programmes), `src/app/Equipment.tsx` (last uses), `src/i18n/pt-PT.ts`

**Interfaces:**
- Consumes: `likelyProgramme`, `programmeUses`, `averageDifferencePct`, `energyDifferencePct` (Task 2); `storedAnalyses(meter, from, to)` from `src/app/nilm-days.ts`; `classify` from `src/nilm/appliances.ts`.
- Produces:
  - In "Ao segundo", under a group whose appliance is linked to an equipment with programmes, for each whole programme: "Parece o programa {name}: o manual diz {h:mm} e {kWh}; esta usou {kWh} ({+N %} que o manual)", or "Programa não identificado" when `likelyProgramme` is null.
  - On the equipment page, only with a Shelly: the uses of the last 30 days from `storedAnalyses` (cycles classified to an appliance linked to this equipment, whole programmes only), latest first, each with programme and difference, and the average: "Em média, {+N %} que o manual." with the note "O manual mede em condições de ensaio: a carga e a temperatura da água mudam o consumo." No trend words.
- [ ] **Step 1:** Domain is tested in Task 2; here, visual check in the demonstration with the sample washer (or, if the demo has no whole programme of that washer, check against the account locally with `pnpm dev` + `pnpm dev:server` and a programme through the Task 2 test values).
- [ ] **Step 2:** `pnpm typecheck && pnpm lint && pnpm test` → PASS; close the browser and the server.
- [ ] **Step 3:** Commit `feat(equipment): the likely programme of each wash`.

### Task 9: Documentation and closing checks

**Files:**
- Create: `docs/equipment.md` (what is kept, the plate ceiling and its real numbers, the manual's table and the 2019/2023 regulation with source and date, EPREL tested and left out, no images)
- Modify: `planning/plan.md` (a decision dated 2026-11-03 and the boxes), `docs/local-mode.md` (the register works without an account), `CLAUDE.md` (data model summary: `equipment`, `appliances.equipment_id`)

- [ ] **Step 1:** Write the docs.
- [ ] **Step 2:** `pnpm typecheck && pnpm lint && pnpm test && pnpm build` → PASS.
- [ ] **Step 3:** Commit `docs(equipment): the register and how the app uses it`.
