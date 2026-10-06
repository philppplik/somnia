import {test, expect} from './fixtures';
import {readFileSync} from 'node:fs';
const catalogues = Object.fromEntries(['en', 'de', 'es', 'fr', 'pt-BR'].map(locale =>
 [locale, JSON.parse(readFileSync(new URL(`../src/locales/${locale}.json`, import.meta.url), 'utf8')) as Record<string, string>]
));

for (const [locale, t] of Object.entries(catalogues)) {
 test(`${locale}: Help and command palette deep-link to Settings shortcuts`, async ({page}) => {
  await page.goto('/');
  await page.evaluate(tag => localStorage.setItem('somnia.locale.v1', tag), locale);
  await page.reload();
  await page.getByRole('button', {name: t['menu.Help'], exact: true}).click();
  await page.getByRole('menuitem', {name: t['cmd.help.shortcuts'], exact: true}).click();
  const dialog = page.getByRole('dialog');
  const selected = dialog.getByRole('button', {name: t['set.section.shortcuts'], exact: true});
  await expect(dialog).toBeVisible();
  await expect(selected).toHaveAttribute('aria-current', 'page');
  await expect(selected).toBeInViewport();
  await expect(dialog.getByRole('heading', {name: t['set.section.shortcuts'], exact: true})).toBeInViewport();
  await expect(dialog.getByRole('list', {name: t['cmd.help.shortcuts'], exact: true})).toContainText(t['cmd.sidebar.toggle']);
  await expect(dialog).toHaveAccessibleDescription(t['set.sc.description']);
  // Leave Settings on a different section, with an active search and scroll.
  await dialog.getByRole('button', {name: t['set.section.appearance'], exact: true}).click();
  await dialog.getByLabel(t['redesign.search']).fill(t['set.section.appearance']);
  await dialog.locator('.settings-content').evaluate(el => {el.scrollTop = el.scrollHeight;});
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await page.keyboard.press('Control+k');
  await page.getByRole('combobox').fill(t['cmd.help.shortcuts']);
  await page.getByRole('option').filter({hasText: t['cmd.help.shortcuts']}).click();
  await expect(dialog.getByRole('heading', {name: t['set.title'], exact: true})).toBeVisible();
  await expect(selected).toHaveAttribute('aria-current', 'page');
  await expect(dialog.getByLabel(t['redesign.search'])).toHaveValue('');
  await expect(dialog.getByRole('heading', {name: t['set.section.shortcuts'], exact: true})).toBeInViewport();
  expect(await dialog.locator('.settings-content').evaluate(el => el.scrollTop)).toBe(0);
  if (locale === 'en') await page.screenshot({path: '/downloads/help-shortcuts-settings.png'});
 });
}

test('deep-link clears a search while Settings is already open', async ({page}) => {
 await page.goto('/');
 await page.getByRole('button', {name: 'Help', exact: true}).click();
 await page.getByRole('menuitem', {name: 'Keyboard shortcuts', exact: true}).click();
 const dialog = page.getByRole('dialog');
 await dialog.getByLabel('Search settings').fill('dark');
 await dialog.locator('.settings-content').evaluate(el => {el.scrollTop = el.scrollHeight;});
 await page.evaluate(async () => {
  const {executeNativeMenuCommand} = await import('/src/lib/commands.ts');
  await executeNativeMenuCommand('help.shortcuts');
 });
 await expect(dialog.getByLabel('Search settings')).toHaveValue('');
 await expect(dialog.getByRole('button', {name: 'Shortcuts', exact: true})).toHaveAttribute('aria-current', 'page');
 await expect(dialog.getByRole('heading', {name: 'Shortcuts', exact: true})).toBeInViewport();
});
