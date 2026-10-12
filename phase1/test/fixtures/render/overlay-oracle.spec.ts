import {test, expect} from '@playwright/test';
import {manifest} from './corpus';
import {openFixture} from './helpers';
// Plan step 3.3: the canvas selection overlay box must match the real DOM box within 1 px.
// Overlay boxes use the app's elementOverlayBox(); the expectation is derived from the frame's own
// screen rect (screen px per frame px) and the element's own box. Frames are checked at several zoom scales.
const TOLERANCE = 1;
const SCALES = [1, 0.75, 0.5];
for (const fixture of manifest.fixtures) {
  for (const viewport of fixture.viewports) {
    test(`overlay oracle ${fixture.id} ${viewport.width}x${viewport.height}`, async ({page}) => {
      await openFixture(page, fixture, viewport, true);
      for (const scale of SCALES) {
        const rows = await page.evaluate(s => window.overlayOracle(s), scale);
        expect(rows.length, 'fixture has measurable elements').toBeGreaterThan(2);
        const worst = {drift: 0, label: ''};
        for (const row of rows) {
          for (let i = 0; i < 4; i++) {
            const drift = Math.abs(row.overlay[i] - row.expected[i]);
            if (drift > worst.drift) { worst.drift = drift; worst.label = `${row.label} coord ${i} at scale ${scale}`; }
          }
        }
        expect(worst.drift, `max overlay drift (${worst.label})`).toBeLessThanOrEqual(TOLERANCE);
      }
    });
  }
}
