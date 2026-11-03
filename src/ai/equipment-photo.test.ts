// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { AnthropicProvider } from './anthropic';
import { estimateEquipmentPhotos, readEquipmentPhotos } from './equipment-photo';
import { fakeApi, message } from './fake-api';

const PRINTED = {
  kind: 'washer',
  brand: 'Exemplo',
  model: 'WX-100',
  ratedPower: '2100 W',
  energyClass: 'A',
  programmes: [
    { name: 'Mix', duration: '1:21', energy: '0,46 kWh', temperature: '40', load: '8 kg' },
  ],
};

const provider = (fetch: typeof globalThis.fetch) =>
  new AnthropicProvider({ apiKey: 'k', model: 'claude-sonnet-5-5', fetch });

describe('readEquipmentPhotos', () => {
  it('sends the photos before the text and gives back the values in the register’s units', async () => {
    const api = fakeApi([
      { status: 200, body: message([{ type: 'text', text: JSON.stringify(PRINTED) }]) },
    ]);
    const photos = [
      { mime: 'image/jpeg' as const, base64: 'AAAA' },
      { mime: 'image/jpeg' as const, base64: 'BBBB' },
    ];
    const result = await readEquipmentPhotos(provider(api.fetch), photos);
    expect(result.reading).toMatchObject({
      kind: 'washer',
      ratedPowerW: 2100,
      programmes: [{ name: 'Mix', durationS: 4860, energyWh: 460 }],
    });
    expect(result.usage).toMatchObject([
      { task: 'read_equipment', promptVersion: 'equipment-photo-1' },
    ]);
    const messages = api.requests[0]?.body.messages as { content: { type: string }[] }[];
    const content = messages[0]!.content;
    expect(content.map((block) => block.type)).toEqual(['image', 'image', 'text']);
    expect(content[0]).toMatchObject({
      source: { type: 'base64', media_type: 'image/jpeg', data: 'AAAA' },
    });
  });

  it('tries once more when the answer is not what was asked, then gives up', async () => {
    const bad = { status: 200, body: message([{ type: 'text', text: '{"brand": 3}' }]) };
    const api = fakeApi([bad, bad]);
    await expect(
      readEquipmentPhotos(provider(api.fetch), [{ mime: 'image/jpeg', base64: 'AAAA' }]),
    ).rejects.toMatchObject({ code: 'invalid_output' });
    expect(api.requests).toHaveLength(2);
  });

  it('estimates each photo on the high side', () => {
    const one = estimateEquipmentPhotos('claude-sonnet-5-5', 1);
    const three = estimateEquipmentPhotos('claude-sonnet-5-5', 3);
    expect(three.inputTokens - one.inputTokens).toBe(2 * 1600);
    expect(three.costMicroUsd).toBeGreaterThan(one.costMicroUsd);
  });
});
