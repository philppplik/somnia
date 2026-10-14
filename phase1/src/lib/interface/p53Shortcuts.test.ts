import test from 'node:test';import assert from 'node:assert/strict';
import {INTERFACE_SHORTCUT_ENTRIES,formatInterfaceShortcut} from './shortcuts';
import {t,setLocale} from '../i18n';
test('shortcut entries are unique and localized in all five locales',()=>{assert.ok(INTERFACE_SHORTCUT_ENTRIES.length>=10);assert.equal(new Set(INTERFACE_SHORTCUT_ENTRIES.map(e=>e.combo)).size,INTERFACE_SHORTCUT_ENTRIES.length,'unique combos');
 for(const locale of ['en','de','es','fr','pt-BR'] as const){setLocale(locale);for(const entry of INTERFACE_SHORTCUT_ENTRIES){const label=t(entry.labelKey);assert.ok(label&&label!==entry.labelKey,`${locale} resolves ${entry.labelKey}`);}assert.notEqual(t('interface.shortcuts'),'interface.shortcuts');assert.notEqual(t('interface.shortcutsClose'),'interface.shortcutsClose');}
 setLocale('en');});
test('formatInterfaceShortcut renders Mod per platform and leaves other combos untouched',()=>{assert.equal(formatInterfaceShortcut('Mod+Z',true),'⌘+Z');assert.equal(formatInterfaceShortcut('Mod+Z',false),'Ctrl+Z');assert.equal(formatInterfaceShortcut('Mod+Shift+Z',false),'Ctrl+Shift+Z');assert.equal(formatInterfaceShortcut('Shift+←↑→↓',true),'Shift+←↑→↓');assert.equal(formatInterfaceShortcut('?',false),'?');});
test('every real canvas binding has an entry',()=>{const keys=INTERFACE_SHORTCUT_ENTRIES.map(e=>e.combo);for(const combo of ['←↑→↓','Shift+←↑→↓','Alt+←↑→↓','Mod+Z','Mod+Shift+Z','Mod+A','Mod+C','Mod+V','Mod+D','Del','Enter/Space','Esc','Shift+Click','?'])assert.ok(keys.includes(combo),combo);});
