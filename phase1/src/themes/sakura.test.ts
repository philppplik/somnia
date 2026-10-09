import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {SAKURA_THEME_CHOICES} from './sakura';

const css = readFileSync(new URL('./sakura.css', import.meta.url), 'utf8');
function luminance(hex: string) {
  const [r, g, b] = hex.slice(1).match(/../g)!.map(v => parseInt(v, 16) / 255)
    .map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
  return .2126 * r + .7152 * g + .0722 * b;
}
function contrast(a: string, b: string) {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + .05) / (low + .05);
}

test('Sakura provides independent light and dark registry choices', () => {
  assert.deepEqual(SAKURA_THEME_CHOICES.map(({id, mode, palette}) => ({id, mode, palette})), [
    {id: 'sakura-light', mode: 'light', palette: 'sakura'},
    {id: 'sakura-dark', mode: 'dark', palette: 'sakura'},
  ]);
});
for (const mode of ['light', 'dark']) {
  test(`Sakura ${mode}: normal text meets 4.5:1 on every UI surface`, () => {
    const block = css.match(new RegExp(`data-theme=${mode}[^}]+}`))![0];
    assert.ok(block.includes(':not([data-contrast=high])'));
    const tokens = Object.fromEntries([...block.matchAll(/--([\w-]+): (#[\da-f]{6});/g)]
      .map(m => [m[1], m[2]]));
    for (const text of ['text-primary', 'text-secondary', 'text-tertiary']) {
      for (const bg of ['bg-base', 'bg-panel', 'bg-elevated', 'bg-surface', 'bg-hover', 'canvas-bg', 'shell-bg']) {
        assert.ok(contrast(tokens[text], tokens[bg]) >= 4.5, `${text} on ${bg}`);
      }
    }
    assert.ok(contrast('#ffffff', tokens['accent-fill']) >= 4.5);
    assert.ok(contrast(tokens['accent'], tokens['accent-ink']) >= 4.5);
    for (const fg of ['accent', 'danger', 'warning']) {
      assert.ok(contrast(tokens[fg], tokens['bg-panel']) >= 4.5, `${fg} on panel`);
    }
    assert.ok(!block.includes('--page-bg'), 'Project canvas must not be recoloured');
  });
}
