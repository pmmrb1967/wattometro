// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, it } from 'vitest';
import { t } from '../i18n/pt-PT';
import { chatPageOf, type ChatPage } from './chat-page';

it('knows the pages the chat is offered on', () => {
  expect(chatPageOf('/')).toBe('home');
  expect(chatPageOf('/consumo')).toBe('consumption');
  expect(chatPageOf('/consumo/')).toBe('consumption');
  expect(chatPageOf('/consumo/relatorio')).toBe('report');
  expect(chatPageOf('/potencia')).toBe('power');
  expect(chatPageOf('/tarifarios')).toBe('tariffs');
  expect(chatPageOf('/qualidade')).toBe('quality');
  expect(chatPageOf('/perguntar')).toBe('home');
});

it('is not offered in the settings, where the key is set', () => {
  expect(chatPageOf('/definicoes')).toBeNull();
  expect(chatPageOf('/nao-existe')).toBeNull();
});

it('has a name and suggested questions for every page', () => {
  const pages: ChatPage[] = ['home', 'consumption', 'report', 'power', 'tariffs', 'quality'];
  for (const page of pages) {
    expect(t.ask.pages[page]).not.toBe('');
    expect(t.ask.suggestions[page].length).toBeGreaterThanOrEqual(3);
  }
});
