import {test} from 'node:test';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import '../../lib/studios';
import {IconRail} from '../IconRail';
import {patchState} from '../../store/appStore';
import {setLocale} from '../../lib/i18n';
const items=(html:string)=>[...html.matchAll(/data-rail-item="([^"]+)"/g)].map(m=>m[1]);
test('Slides rails render from the manifest: icons, localized labels, overflow button',()=>{
 patchState({activeStudio:'slides'});
 const left=renderToStaticMarkup(<IconRail side="left"/>),right=renderToStaticMarkup(<IconRail side="right"/>);
 assert.deepEqual(items(left),['files','overview','outline','search','versions','saveCopy']);
 assert.deepEqual(items(right),['inspector']);
 const icons=[...left.matchAll(/data-icon="([^"]+)"/g)].map(m=>m[1]);assert.deepEqual(icons.filter(i=>!['vadivam:panel-left','vadivam:blocks','vadivam:settings'].includes(i)),['vadivam:folder-code','vadivam:copy','vadivam:hash','vadivam:search','versions','vadivam:download']);
 assert.ok(renderToStaticMarkup(<IconRail side="right"/>).includes('data-icon="vadivam:presentation"'));
 
 assert.ok(left.includes('data-testid="rail-more"'));assert.ok(!right.includes('data-testid="rail-more"'));
 assert.ok(left.includes('aria-label="Slides panel"'),'panel item label');
 assert.match(left,/data-rail-item="saveCopy"[^>]*aria-label="Save a copy[^"]*"/,'command item label');
 setLocale('de');const de=renderToStaticMarkup(<IconRail side="left"/>);setLocale('en');
 assert.ok(de.includes('Folien')&&de.includes('Kopie speichern'));
 patchState({activeStudio:'code'});
 assert.ok(!renderToStaticMarkup(<IconRail side="left"/>).includes('data-testid="rail-more"'),'Code rail unchanged');
});
