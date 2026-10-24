import {expect, type Page} from '@playwright/test';
import {projectFiles, fontData, type RenderFixture} from './corpus';
const files = projectFiles();
/** Load a fixture into the live-preview harness and wait until fonts, images and ready markers settled. */
export async function openFixture(page: Page, fixture: RenderFixture, viewport: {width: number; height: number}, inspect = false) {
  await page.goto('/test/fixtures/render/harness.html');
  await page.waitForFunction(() => typeof window.renderReference === 'function');
  await page.evaluate(input => window.renderReference(input), {fixture, viewport, files, fontData, inspect});
  const frame = page.frameLocator('#preview');
  await expect(frame.locator('body')).toHaveAttribute('data-fixture', fixture.id);
  if (fixture.readySelector) await expect(frame.locator(fixture.readySelector)).toHaveText(fixture.readyText!);
  await frame.locator('body').evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(Array.from(document.images).map(img => img.decode()));
    if (!document.fonts.check('14px RenderReference')) throw new Error('Bundled reference font failed to load');
  });
  expect(await page.evaluate(() => window.referenceResult)).toEqual({unloaded: [], external: []});
}
