import {test} from '@playwright/test';
import {mkdirSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {manifest} from './corpus';
import {openFixture} from './helpers';
// Capture-only spec for determinism.ts (plan step 3.6). Writes the raw preview PNGs; it compares nothing.
const dir = process.env.SOMNIA_RENDER_CAPTURE_DIR;
if (!dir) throw new Error('Run through test/fixtures/render/determinism.ts');
mkdirSync(dir, {recursive: true});
for (const fixture of manifest.fixtures) {
  for (const viewport of fixture.viewports) {
    test(`capture ${fixture.id} ${viewport.width}x${viewport.height}`, async ({page}) => {
      await openFixture(page, fixture, viewport);
      const png = await page.locator('#preview').screenshot({animations: 'disabled'});
      writeFileSync(path.join(dir, `${fixture.id}-${viewport.width}x${viewport.height}.png`), png);
    });
  }
}
