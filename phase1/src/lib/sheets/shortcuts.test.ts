import test from 'node:test';import assert from 'node:assert/strict';
import {SHEETS_SHORTCUT_GROUPS,formatSheetsShortcut,setSheetsShortcutsOpen} from './shortcuts';
import {SHEETS_PANEL_CATALOGUES} from './panelI18n';
test('every shortcut is unique and localized in all five locales',()=>{
 const all=SHEETS_SHORTCUT_GROUPS.flatMap(g=>g.entries);
 assert.equal(new Set(all.map(e=>e.combo)).size,all.length);assert.equal(new Set(all.map(e=>e.labelKey)).size,all.length);
 for(const k of [...all.map(e=>e.labelKey),...SHEETS_SHORTCUT_GROUPS.map(g=>'sheets.sc.g.'+g.id),'sheets.sc.title','sheets.sc.close','sheets.sc.button'])for(const l of ['en','de','es','fr','pt-BR'] as const){const v=(SHEETS_PANEL_CATALOGUES as Record<string,Record<string,string>>)[l][k];assert.ok(typeof v==='string'&&v.length>0,l+' '+k);}
});
test('Mod is Ctrl or Command',()=>{assert.equal(formatSheetsShortcut('Mod+Shift+Z',false),'Ctrl+Shift+Z');assert.equal(formatSheetsShortcut('Mod+Y / Mod+Shift+Z',true),'⌘+Y / ⌘+Shift+Z');assert.equal(formatSheetsShortcut('Tab',true),'Tab');});
test('open state toggles',()=>{setSheetsShortcutsOpen(true);setSheetsShortcutsOpen(false);});
