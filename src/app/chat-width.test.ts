// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, it } from 'vitest';
import { CHAT_MAX_WIDTH, CHAT_MIN_WIDTH, chatWidthAt, clampChatWidth } from './chat-width';

it('keeps the width within its limits', () => {
  expect(clampChatWidth(500, 1280)).toBe(500);
  expect(clampChatWidth(100, 1280)).toBe(CHAT_MIN_WIDTH);
  expect(clampChatWidth(2000, 1920)).toBe(CHAT_MAX_WIDTH);
});

it('never goes past the window, less its margins', () => {
  // 800 − 2 × 24 = 752.
  expect(clampChatWidth(790, 800)).toBe(752);
  // A window narrower than the minimum still gets the minimum.
  expect(clampChatWidth(500, 300)).toBe(CHAT_MIN_WIDTH);
});

it('follows the pointer with the right edge fixed', () => {
  // Right edge at 1280 − 24 = 1256; a pointer at 756 gives 500.
  expect(chatWidthAt(756, 1280)).toBe(500);
  expect(chatWidthAt(1200, 1280)).toBe(CHAT_MIN_WIDTH);
});
