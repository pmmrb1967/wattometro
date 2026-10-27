// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The page the chat is opened on: it picks the suggested questions and is
 * named to the AI (only its name, no data). Null where the chat is not
 * offered (Definições, where the AI key is set).
 */
export type ChatPage = 'home' | 'consumption' | 'report' | 'power' | 'tariffs' | 'quality';

const PAGES: Record<string, ChatPage> = {
  '/': 'home',
  '/perguntar': 'home',
  '/consumo': 'consumption',
  '/consumo/relatorio': 'report',
  '/consumo/calibrar': 'consumption',
  '/consumo/aparelhos': 'consumption',
  '/potencia': 'power',
  '/tarifarios': 'tariffs',
  '/qualidade': 'quality',
};

export function chatPageOf(pathname: string): ChatPage | null {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  return PAGES[path] ?? null;
}
