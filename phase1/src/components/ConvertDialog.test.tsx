import test from 'node:test';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import {Dialog} from './ui/dialog';
import {ConvertPanel} from './ConvertDialog';
import {translate} from '../lib/i18n';
import {CATALOGUES} from '../lib/i18n';

test('empty converter shows the drop zone, a file picker and a disabled start button',()=>{
 const html=renderToStaticMarkup(<Dialog open><ConvertPanel onClose={()=>{}}/></Dialog>);
 assert.match(html,/class="cv-drop"/);assert.match(html,/Drop files here/);assert.match(html,/data-testid="convert-input"/);assert.match(html,/multiple/);
 assert.doesNotMatch(html,/Convert to<\/h3>/);
 assert.match(html,/<button[^>]*disabled=""[^>]*>Convert to …<\/button>/);
 assert.match(html,/aria-label="Close/);
});
test('every convert key exists in all locales with matching placeholders',()=>{
 const base=CATALOGUES.en;const keys=Object.keys(base).filter(k=>k.startsWith('convert.')||k==='cmd.tools.convert');
 assert.ok(keys.length>=37);
 for(const [loc,cat] of Object.entries(CATALOGUES))for(const k of keys){assert.ok(cat[k],`${loc} ${k}`);const ph=(s:string)=>[...s.matchAll(/\{(\w+)\}/g)].map(m=>m[1]).sort().join();assert.equal(ph(cat[k]),ph(base[k]),`${loc} ${k}`);}
 assert.equal(translate('de','convert.start',{format:'PNG'}),'Zu PNG konvertieren');
});
