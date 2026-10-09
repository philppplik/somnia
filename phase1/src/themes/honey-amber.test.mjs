import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const css = readFileSync(new URL('./honey-amber.css', import.meta.url), 'utf8');
const luminance = hex => {
  const channels = hex.slice(1).match(/../g).map(c => parseInt(c, 16) / 255)
    .map(c => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
};
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((a, b) => b - a);
  return (hi + .05) / (lo + .05);
};
for (const mode of ['dark', 'light']) {
  test(`Honey Amber ${mode}: readable text, status and accent labels`, () => {
    const block = css.match(new RegExp(`:root\\[data-theme='${mode}'\\][^{]+\\{([^}]+)\\}`))[1];
    const tokens = Object.fromEntries([...block.matchAll(/(--[\w-]+):\s*(#[\da-f]{6});/g)].map(m => [m[1], m[2]]));
    for (const bg of ['--bg-base', '--bg-panel', '--bg-elevated', '--bg-surface', '--bg-hover', '--canvas-bg', '--shell-bg']) {
      for (const ink of ['--text-primary', '--text-secondary', '--text-tertiary', '--accent', '--warning', '--danger']) {
        const ratio = contrast(tokens[ink], tokens[bg]);
        assert.ok(ratio >= 4.5, `${ink} on ${bg}: ${ratio.toFixed(2)} < 4.5`);
      }
    }
    assert.ok(contrast('#ffffff', tokens['--accent-fill']) >= 4.5, 'White on accent-fill');
    assert.ok(contrast(tokens['--accent-ink'], tokens['--accent']) >= 4.5, 'accent-ink on accent');
  });
}
