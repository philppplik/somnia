import {test, expect} from '@playwright/test';
import {manifest, projectFiles, fontData} from './corpus';
import {updateScope} from './approval';
const updating = process.argv.some(a => /^--update-snapshots(?:=|$)/.test(a) || a === '-u');
const scope = updating ? updateScope() : null;
const files = projectFiles();
for (const fixture of manifest.fixtures.filter(f => !scope || scope.includes(f.id))) {
  for (const viewport of fixture.viewports) {
    test(`${fixture.id} ${viewport.width}x${viewport.height}`, async ({page}) => {
      // A sandbox data-only project must not depend on a CDN or installed system fonts.
      await page.goto('/test/fixtures/render/harness.html');
      await page.waitForFunction(() => typeof window.renderReference === 'function');
      await page.evaluate(input => window.renderReference(input), {fixture, viewport, files, fontData});
      const frame = page.frameLocator('#preview');
      await expect(frame.locator('body')).toHaveAttribute('data-fixture', fixture.id);
      if (fixture.readySelector) await expect(frame.locator(fixture.readySelector)).toHaveText(fixture.readyText!);
      await frame.locator('body').evaluate(async () => {
        await document.fonts.ready;
        await Promise.all(Array.from(document.images).map(img => img.decode()));
        if (!document.fonts.check('14px RenderReference')) throw new Error('Bundled reference font failed to load');
      });
      expect(await page.evaluate(() => window.referenceResult)).toEqual({unloaded: [], external: []});
      const shot = page.locator('#preview');
      // First assert intra-run byte determinism, then compare against the approved reference.
      const first = await shot.screenshot({animations: 'disabled'});
      // Rebuild fresh srcDoc (including new nonce/IDs), not just a second capture of the same frame.
      await page.evaluate(input => window.renderReference(input), {fixture, viewport, files, fontData});
      await frame.locator('body').evaluate(async () => {
        await document.fonts.ready;
        await Promise.all(Array.from(document.images).map(img => img.decode()));
      });
      if (fixture.readySelector) await expect(frame.locator(fixture.readySelector)).toHaveText(fixture.readyText!);
      expect(await shot.screenshot({animations: 'disabled'})).toEqual(first);
      await expect(shot).toHaveScreenshot(`${fixture.id}-${viewport.width}x${viewport.height}.png`);
    });
  }
}
