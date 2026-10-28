// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The app's pages counted in the administrator's panel (docs/admin.md): a
 * fixed list, so the server only stores these names, never a path someone typed.
 */
export const VISIT_PAGES = [
  '/',
  '/consumo',
  '/consumo/relatorio',
  '/consumo/aparelhos',
  '/consumo/calibrar',
  '/potencia',
  '/tarifarios',
  '/qualidade',
  '/definicoes',
] as const;
export type VisitPage = (typeof VISIT_PAGES)[number];

export function isVisitPage(path: string): path is VisitPage {
  return (VISIT_PAGES as readonly string[]).includes(path);
}
