// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * "Ler de fotografias" (src/ai/prompts/equipment-photo.ts): photos of a plate,
 * an energy label or a manual's table go straight to the AI with the user's
 * key, are read once and kept nowhere. The answer is the printed text; the
 * register's values come from src/domain/equipment-reading.ts.
 */
import { fromPrinted, type EquipmentReading } from '../domain/equipment-reading';
import { estimateTextTokens } from './estimate';
import { costMicroUsd } from './models';
import {
  EQUIPMENT_PHOTO_MAX_TOKENS,
  EQUIPMENT_PHOTO_PROMPT_VERSION,
  EQUIPMENT_PHOTO_SCHEMA,
  EQUIPMENT_PHOTO_SYSTEM,
  EQUIPMENT_PHOTO_USER,
  printedEquipmentSchema,
} from './prompts/equipment-photo';
import type { AiEstimate, AiImage, AiProvider, AiUsage } from './provider';

/** A photo made small (src/lib/image.ts) is at most about 1.15 MP / 750 ≈ 1534 tokens. */
const PHOTO_TOKENS = 1_600;

export async function readEquipmentPhotos(
  provider: AiProvider,
  photos: readonly AiImage[],
): Promise<{ reading: EquipmentReading; usage: AiUsage[] }> {
  const { data, usage } = await provider.writeStructured({
    task: 'read_equipment',
    promptVersion: EQUIPMENT_PHOTO_PROMPT_VERSION,
    system: EQUIPMENT_PHOTO_SYSTEM,
    user: EQUIPMENT_PHOTO_USER,
    images: photos,
    maxOutputTokens: EQUIPMENT_PHOTO_MAX_TOKENS,
    schema: EQUIPMENT_PHOTO_SCHEMA,
    validator: printedEquipmentSchema,
  });
  return { reading: fromPrinted(data), usage };
}

/** On the high side: every photo at the largest size, the whole answer budget as output. */
export function estimateEquipmentPhotos(model: string, photos: number): AiEstimate {
  const inputTokens =
    estimateTextTokens(EQUIPMENT_PHOTO_SYSTEM) +
    estimateTextTokens(EQUIPMENT_PHOTO_USER) +
    PHOTO_TOKENS * photos;
  return {
    inputTokens,
    outputTokens: EQUIPMENT_PHOTO_MAX_TOKENS,
    costMicroUsd: costMicroUsd(model, inputTokens, EQUIPMENT_PHOTO_MAX_TOKENS),
  };
}
