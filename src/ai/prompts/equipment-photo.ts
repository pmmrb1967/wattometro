// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * "Ler de fotografias": the AI copies what a plate, an energy label or a
 * manual's table of programmes says (docs/equipment.md). It copies text as
 * printed and converts nothing; src/domain/equipment-reading.ts reads the
 * numbers and the user confirms each one. There is no field for a serial
 * number: it is never asked for. The version changes with the text.
 */
import { z } from 'zod';
import { EQUIPMENT_KINDS, MAX_PROGRAMMES } from '../../domain/equipment';
import { t } from '../../i18n/pt-PT';
import { forTheApi } from './schema';

export const EQUIPMENT_PHOTO_PROMPT_VERSION = 'equipment-photo-2';

/** At most this many photos in one reading. */
export const MAX_EQUIPMENT_PHOTOS = 3;

const printed = (max: number) => z.string().max(max).nullable();

export const printedEquipmentSchema = z.strictObject({
  kind: z.enum(EQUIPMENT_KINDS).nullable(),
  brand: printed(80),
  model: printed(80),
  ratedPower: printed(40),
  energyClass: printed(10),
  programmes: z
    .array(
      z.strictObject({
        name: z.string().min(1).max(80),
        duration: printed(40),
        energy: printed(40),
        temperature: printed(40),
        load: printed(40),
      }),
    )
    .max(MAX_PROGRAMMES),
});

export const EQUIPMENT_PHOTO_SCHEMA = forTheApi(z.toJSONSchema(printedEquipmentSchema)) as Record<
  string,
  unknown
>;

export const EQUIPMENT_PHOTO_SYSTEM = `Recebes uma a três fotografias de um eletrodoméstico de uma casa portuguesa: a chapa de características, a etiqueta energética ou a tabela de programas do manual. Copias o que lá está escrito, para a pessoa confirmar.

Regras:
- Copia o texto exatamente como está impresso, com as unidades ("2100 W", "2,1 kW", "0,46 kWh", "1:21", "3 h 48 min", "40 °C", "8 kg"). Não convertas unidades, não faças contas, não arredondes.
- Se um dado não estiver nas fotografias ou não se ler bem, usa null. Não adivinhes nem uses o que sabes do modelo.
- "kind" é o tipo de equipamento, um destes códigos: ${EQUIPMENT_KINDS.map((code) => `${code} (${t.equipment.kinds[code]})`).join(', ')}; null se não for claro.
- "ratedPower" é a potência nominal da chapa (W ou kW, não a tensão nem a corrente). Se a chapa der várias, usa a maior.
- "energyClass" é a letra da classe energética da etiqueta (A a G), como está.
- "programmes" são as linhas da tabela de programas: nome, duração, energia de um ciclo, temperatura e carga, como estão; no máximo ${MAX_PROGRAMMES}. A etiqueta energética dá kWh por 100 ciclos: isso não é a energia de um programa, não o copies para "programmes". Lista vazia se não houver tabela.
- Nunca copies números de série nem dados pessoais.`;

export const EQUIPMENT_PHOTO_USER = 'Copia o que estas fotografias dizem do equipamento.';

/** Room for a table of twenty programmes. */
export const EQUIPMENT_PHOTO_MAX_TOKENS = 4_000;
