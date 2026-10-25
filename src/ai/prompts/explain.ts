// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * "Explicar": a month's report or an unusual day told in plain words, from the
 * facts the app computed (the same the tools give the chat). The answer is
 * JSON in EXPLAIN_SCHEMA, checked with zod; the version changes with the text.
 */
import { z } from 'zod';

export const EXPLAIN_PROMPT_VERSION = 'explain-1';

export type ExplainSubject = 'month' | 'unusualDay';

export const explanationSchema = z.strictObject({
  /** One sentence: what matters most. */
  headline: z.string().min(1).max(300),
  /** What explains it, from the facts. */
  points: z.array(z.string().min(1).max(300)).max(4),
  /** Concrete things to try or check (may be none). */
  actions: z.array(z.string().min(1).max(300)).max(3),
});
export type Explanation = z.infer<typeof explanationSchema>;

/** Keywords structured outputs do not accept; zod still checks them on the answer. */
const UNSUPPORTED = [
  '$schema',
  'minLength',
  'maxLength',
  'minItems',
  'maxItems',
  'minimum',
  'maximum',
];

function forTheApi(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(forTheApi);
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !UNSUPPORTED.includes(key))
      .map(([key, item]) => [key, forTheApi(item)]),
  );
}

export const EXPLAIN_SCHEMA = forTheApi(z.toJSONSchema(explanationSchema)) as Record<
  string,
  unknown
>;

export const EXPLAIN_SYSTEM = `Explicas a uma pessoa, em português europeu e tratando-a por "tu", números do consumo elétrico da casa dela, calculados pela app Wattómetro (dados da E-Redes e de um Shelly no quadro elétrico).

Usa só os factos que recebes. Cita os números exatamente como vêm, com as mesmas unidades; não faças contas, não arredondes e não acrescentes números que não estejam nos factos. Não inventes causas: quando sugerires uma, apresenta-a como hipótese ("pode ter sido…"). Os custos são estimativas a partir do consumo, não a fatura.

Responde em JSON: "headline" é uma frase com o que mais importa; "points" são até quatro frases curtas que explicam; "actions" são até três coisas concretas a experimentar ou verificar (lista vazia se não houver). Trabalhos na instalação elétrica são para um eletricista certificado.`;

const SUBJECTS: Record<ExplainSubject, string> = {
  month: 'O relatório de um mês (página Relatório).',
  unusualDay:
    'Um dia em que a casa gastou muito mais ou muito menos do que é costume para esse tipo de dia (página Consumo, "Dias fora do habitual"). "kind" é o tipo de dia: workday (dia útil), saturday ou sunday (domingo ou feriado).',
};

export function explainUser(subject: ExplainSubject, facts: unknown): string {
  return `${SUBJECTS[subject]}\n\nFactos:\n${JSON.stringify(facts, null, 2)}`;
}

/** Room for some thinking and the short JSON answer. */
export const EXPLAIN_MAX_TOKENS = 4_000;
