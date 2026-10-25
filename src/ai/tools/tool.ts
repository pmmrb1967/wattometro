// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Tools the AI may call (CLAUDE.md, "IA"). They run in the browser, on the
 * data the app already has, with the same functions the pages use, and
 * answer with small summaries whose numbers are already formatted as the
 * app shows them: the AI quotes them, it never computes them. Inputs are
 * validated with zod; a bad input or a failure becomes an error the AI reads.
 */
import { z } from 'zod';
import type { Offer } from '../../domain/erse';
import type { Tariff } from '../../domain/tariff';
import type { EpochSeconds, LocalDate } from '../../lib/time';
import type { TenthsCelsius, Wh } from '../../lib/units';

export interface ToolContext {
  /** Today in Lisbon. */
  today: LocalDate;
  /** The house's quarter hours (E-Redes and the Shelly joined, as on "Consumo"), in time order. */
  quarters: readonly { ts: EpochSeconds; energyWh: Wh }[];
  /** The last 365 days start here (as on "Tarifários" and the baseload). */
  yearFrom: EpochSeconds;
  tariffs: readonly Tariff[] | null;
  /** Mean temperature per day when the installation follows the weather; else null. */
  daily: ReadonlyMap<LocalDate, TenthsCelsius> | null;
  /** The ERSE offers (public/data/erse-offers.json); null when they cannot be read. */
  offers: () => Promise<readonly Offer[] | null>;
}

export interface AiTool<Input = unknown> {
  name: string;
  description: string;
  input: z.ZodType<Input>;
  run(input: Input, context: ToolContext): Promise<unknown> | unknown;
}

/** Keeps each tool's input type tied to its schema. */
export function defineTool<Input>(tool: AiTool<Input>): AiTool {
  return tool as unknown as AiTool;
}

/** The JSON schema sent to the API (no "$schema" key). */
export function inputSchema(tool: AiTool): Record<string, unknown> {
  const schema = { ...(z.toJSONSchema(tool.input) as Record<string, unknown>) };
  delete schema.$schema;
  return schema;
}

export type ToolOutcome = { ok: true; result: unknown } | { ok: false; error: string };

/** Validates the input and runs the tool; never throws. */
export async function runTool(
  tools: readonly AiTool[],
  name: string,
  input: unknown,
  context: ToolContext,
): Promise<ToolOutcome> {
  const tool = tools.find((candidate) => candidate.name === name);
  if (!tool) return { ok: false, error: `Unknown tool: ${name}` };
  const parsed = tool.input.safeParse(input);
  if (!parsed.success) return { ok: false, error: `Invalid input: ${parsed.error.message}` };
  try {
    return { ok: true, result: await tool.run(parsed.data, context) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Failed' };
  }
}
