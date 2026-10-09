import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {contrastRatio} from '../lib/look';

const css=readFileSync(new URL('./ocean-blue.css',import.meta.url),'utf8');
for(const mode of ['light','dark']){
  const rule=css.match(new RegExp(`:root\\[data-theme="${mode}"\\][^{]+\\{([^}]+)\\}`))!;
  const values=Object.fromEntries([...rule[1].matchAll(/(--[a-z-]+):\s*(#[0-9a-f]{6});/g)].map(m=>[m[1],m[2]]));
  test(`Ocean Blue ${mode}: text and accents meet WCAG AA on opaque UI surfaces`,()=>{
    for(const bg of ['--shell-bg','--canvas-bg','--bg-base','--bg-panel','--bg-elevated','--bg-surface','--bg-hover']){
      for(const fg of ['--text-primary','--text-secondary','--text-tertiary','--accent','--warning','--danger']){
        assert.ok(contrastRatio(values[fg],values[bg])>=4.5,`${fg} on ${bg}: ${contrastRatio(values[fg],values[bg])}`);
      }
    }
    assert.ok(contrastRatio(values['--accent-ink'],values['--accent'])>=4.5);
    assert.ok(contrastRatio('#ffffff',values['--accent-fill'])>=4.5);
    assert.ok(contrastRatio(values['--border-default'],values['--bg-panel'])>=3);
  });
  test(`Ocean Blue ${mode}: palette isolation and high-contrast opt-out`,()=>{
    assert.ok(rule[0].includes('[data-palette="ocean-blue"]:not([data-contrast="high"])'));
    assert.ok(!/--(?:r-|ui-|gap|page-|syntax-)/.test(rule[1]));
  });
}
