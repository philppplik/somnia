import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {contrastRatio} from '../lib/look';
import {LAGOON_TEAL_THEMES} from './lagoon-teal';

const css = readFileSync(new URL('./lagoon-teal.css', import.meta.url), 'utf8');
const surfaces = ['bg-base', 'bg-panel', 'bg-elevated', 'bg-surface', 'bg-hover', 'canvas-bg', 'shell-bg'];
for (const {mode, palette} of LAGOON_TEAL_THEMES) {
  test(`Lagoon Teal ${mode}: readable chrome and accent labels`, () => {
    const selector = `:root[data-theme='${mode}'][data-palette='${palette}']:not([data-contrast='high'])`;
    const rule = css.slice(css.indexOf(selector)).split('}')[0];
    const tokens = Object.fromEntries([...rule.matchAll(/--([a-z-]+):\s*(#[0-9a-f]{6});/g)].map((m) => [m[1], m[2]]));
    for (const foreground of ['text-primary', 'text-secondary', 'text-tertiary', 'accent', 'warning', 'danger']) {
      for (const surface of surfaces) {
        const ratio = contrastRatio(tokens[foreground], tokens[surface]);
        assert.ok(ratio >= 4.5, `${foreground} on ${surface}: ${ratio}:1`);
      }
    }
    assert.ok(contrastRatio(tokens['accent-ink'], tokens.accent) >= 4.5);
    // Existing filled CTA and badge components use white text on accent-fill.
    assert.ok(contrastRatio('#ffffff', tokens['accent-fill']) >= 4.5);
  });
}
