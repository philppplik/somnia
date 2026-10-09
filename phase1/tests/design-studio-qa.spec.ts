import {test, expect} from './fixtures';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import type {Page} from '@playwright/test';

test.use({sample: false});
const fixture = (name: string) => fileURLToPath(new URL(`./assets/design-studio/${name}.somdesign`, import.meta.url));

async function openDesign(page: Page) {
  await page.goto('/');
  await expect(page.locator('[data-storage]')).toBeVisible();
  await page.getByRole('radio', {name: /^(Somnia )?Design$/}).click();
  await expect(page.getByTestId('design-create-blank')).toBeVisible();
}

async function importProject(page: Page, name: string) {
  await page.getByTestId('design-import-input').setInputFiles(fixture(name));
  await expect(page.getByTestId('design-canvas')).toBeVisible();
}

async function downloadProject(page: Page) {
  const pending = page.waitForEvent('download');
  await page.getByTestId('design-export-project').click();
  const download = await pending;
  expect(download.suggestedFilename()).toMatch(/\.somdesign$/);
  const saved = await download.path();
  expect(saved).toBeTruthy();
  return JSON.parse(readFileSync(saved!, 'utf8'));
}

test('start a real blank Design project without triggering a file picker', async ({page}) => {
  await openDesign(page);
  let pickers = 0;
  page.on('filechooser', () => pickers++);
  await page.getByTestId('design-create-blank').click();
  await expect(page.getByTestId('design-canvas')).toBeVisible();
  await expect(page.getByTestId('design-artboard')).toBeVisible();
  await expect(page.getByTestId('design-add-rectangle')).toBeEnabled();
  await expect(page.getByTestId('design-add-text')).toBeEnabled();
  const project = await downloadProject(page);
  expect(project.format).toBe('somnia-design');
  expect(project.artboards[0].nodes).toEqual([]);
  expect(pickers).toBe(0);
  await page.screenshot({path: 'test-results/design-blank.png'});
});

test('rectangle and text insertion survive project export; history restores the layer list', async ({page}) => {
  await openDesign(page);
  await page.getByTestId('design-create-blank').click();
  await page.getByTestId('design-add-rectangle').click();
  await page.getByTestId('design-layer-name').first().dblclick();
  await page.getByTestId('design-layer-name-input').fill('QA rectangle');
  await page.getByTestId('design-layer-name-input').press('Enter');
  await page.getByTestId('design-add-text').click();
  const text = 'Café · 東京 · <Design> & "quotes"';
  await page.getByTestId('design-field-text').fill(text);
  await page.getByTestId('design-field-text').press('Tab');
  const edited = await downloadProject(page);
  expect(edited.artboards[0].nodes.map((node: {kind: string}) => node.kind)).toEqual(['rectangle', 'text']);
  expect(edited.artboards[0].nodes[0].name).toBe('QA rectangle');
  expect(edited.artboards[0].nodes[1].text).toBe(text);
  const beforeUndo = await downloadProject(page);
  await page.getByTestId('design-undo').click();
  const afterUndo = await downloadProject(page);
  expect(afterUndo).not.toEqual(beforeUndo);
  await page.getByTestId('design-redo').click();
  expect(await downloadProject(page)).toEqual(beforeUndo);
  await page.screenshot({path: 'test-results/design-edited.png'});
});

test('native import/export is content-exact and SVG export stays safe and parseable', async ({page}) => {
  await openDesign(page);
  await importProject(page, 'layered');
  expect(await downloadProject(page)).toEqual(JSON.parse(readFileSync(fixture('layered'), 'utf8')));
  const pending = page.waitForEvent('download');
  await page.getByTestId('design-export-svg').click();
  const download = await pending;
  expect(download.suggestedFilename()).toMatch(/\.svg$/);
  const svg = readFileSync((await download.path())!, 'utf8');
  const result = await page.evaluate(source => {
    const doc = new DOMParser().parseFromString(source, 'image/svg+xml');
    return {
      errors: doc.querySelectorAll('parsererror').length,
      namespace: doc.documentElement.namespaceURI,
      viewBox: doc.documentElement.getAttribute('viewBox'),
      text: Array.from(doc.querySelectorAll('text'), element => element.textContent),
      scripts: doc.querySelectorAll('script, foreignObject').length,
    };
  }, svg);
  expect(result.errors).toBe(0);
  expect(result.namespace).toBe('http://www.w3.org/2000/svg');
  expect(result.viewBox).toBe('0 0 640 480');
  expect(result.text).toContain('Café · 東京 · مرحبا · <Design> & "quotes"');
  expect(result.scripts).toBe(0);
});

for (const name of ['malformed', 'wrong-version', 'wrong-format', 'duplicate-ids', 'invalid-geometry', 'unknown-kind']) {
  test(`invalid ${name} import leaves the current project intact`, async ({page}) => {
    await openDesign(page);
    await importProject(page, 'layered');
    const before = await downloadProject(page);
    await page.getByTestId('design-import-input').setInputFiles(fixture(name));
    await expect(page.getByRole('alert')).toBeVisible();
    expect(await downloadProject(page)).toEqual(before);
  });
}

test('hidden/locked layer flags survive native round trip and limit editing/export', async ({page}) => {
  await openDesign(page);
  await importProject(page, 'layer-flags');
  await expect(page.getByTestId('design-layer-qa-card')).toHaveCount(0);
  await expect(page.getByTestId('design-layer-qa-headline')).toBeVisible();
  await page.getByTestId('design-layer-row').filter({hasText: 'Unicode headline'}).getByTestId('design-layer-kind').click();
  await expect(page.getByTestId('design-field-x')).toBeDisabled();
  expect(await downloadProject(page)).toEqual(JSON.parse(readFileSync(fixture('layer-flags'), 'utf8')));
});

test('inspector resize is undoable, invalid geometry is rejected, typing does not trigger tools', async ({page}) => {
  await openDesign(page);
  await importProject(page, 'layered');
  await page.getByTestId('design-layer-name').filter({hasText: 'Blue card'}).click();
  await page.getByTestId('design-field-width').fill('240.5');
  await page.getByTestId('design-field-width').press('Enter');
  const edited = await downloadProject(page);
  expect(edited.artboards[0].nodes[0].width).toBe(240.5);
  await page.getByTestId('design-undo').click();
  expect((await downloadProject(page)).artboards[0].nodes[0].width).toBe(480);
  await page.getByTestId('design-redo').click();
  await page.getByTestId('design-layer-name').filter({hasText: 'Blue card'}).click();
  await page.getByTestId('design-field-width').fill('-1');
  await page.getByTestId('design-field-width').press('Enter');
  await expect(page.getByTestId('design-field-width-error')).toBeVisible();
  expect((await downloadProject(page)).artboards[0].nodes[0].width).toBe(240.5);
  await page.getByTestId('design-field-width').press('Escape');
  await page.getByTestId('design-layer-name').filter({hasText: 'Unicode headline'}).click();
  await page.getByTestId('design-field-text').fill('V H F R T');
  await page.getByTestId('design-field-text').press('t');
  await page.getByTestId('design-field-text').blur();
  expect((await downloadProject(page)).artboards[0].nodes).toHaveLength(2);
  await expect(page.getByTestId('design-tool-select')).toHaveAttribute('aria-pressed', 'true');
});

test('multiple artboards retain independent content and switching studios keeps Design intact', async ({page}) => {
  await openDesign(page);
  await importProject(page, 'multiple-artboards');
  const before = await downloadProject(page);
  await page.getByLabel('Active artboard', {exact: true}).selectOption('qa-board-2');
  await expect(page.getByTestId('design-layer-qa-other')).toBeVisible();
  await expect(page.getByTestId('design-layer-qa-card')).toHaveCount(0);
  await page.getByRole('radio', {name: 'Somnia Code'}).click();
  await page.getByRole('radio', {name: /^(Somnia )?Design$/}).click();
  await expect(page.getByTestId('design-layer-qa-other')).toBeVisible();
  expect(await downloadProject(page)).toEqual(before);
  await page.screenshot({path: 'test-results/design-multiple-artboards.png'});
});
