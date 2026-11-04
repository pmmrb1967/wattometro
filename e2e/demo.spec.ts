// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The demonstration, page by page: each one opens with its heading, without a
 * script error and without a page wider than the screen.
 */
import { expect, test, type Page } from '@playwright/test';

const PAGES: [path: string, heading: RegExp][] = [
  ['/', /Casa de exemplo/],
  ['/consumo', /^Consumo$/],
  ['/consumo/relatorio', /Relatório/],
  ['/consumo/aparelhos', /Aparelhos/],
  ['/equipamentos', /Equipamentos/],
  ['/potencia', /Potência contratada/],
  ['/tarifarios', /Tarifários/],
  ['/qualidade', /Qualidade/],
  ['/definicoes', /Definições/],
];

/** Script errors on the page; a failed request to the API is not one (there is none here). */
function scriptErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

async function enterDemo(page: Page) {
  await page.goto('/');
  await page
    .getByRole('button', { name: 'Ver demonstração' })
    .or(page.getByRole('link', { name: 'Ver demonstração' }))
    .first()
    .click();
  await expect(page.getByText('Demonstração: casa fictícia')).toBeVisible();
}

test('the landing page offers the demonstration and the use without an account', async ({
  page,
}) => {
  const errors = scriptErrors(page);
  await page.goto('/');
  await expect(page.getByText('Ver demonstração').first()).toBeVisible();
  await expect(page.getByText('Usar sem conta').first()).toBeVisible();
  expect(errors).toEqual([]);
});

for (const [path, heading] of PAGES) {
  test(`demonstração: ${path}`, async ({ page }) => {
    const errors = scriptErrors(page);
    await enterDemo(page);
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
    // Let the page's data arrive and its cards settle.
    await page.waitForLoadState('networkidle');
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, 'page wider than the screen').toBeLessThanOrEqual(0);
    expect(errors).toEqual([]);
  });
}
