import test from 'node:test';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import {HistoryTab} from './HistoryTab';
import {HistoryController} from '../../lib/git/history/history';
import type {GitBackend} from '../../lib/git/types';
import {CATALOGUES} from '../../lib/i18n';
test('history has a labelled landmark and loading status; SSR has no effects',()=>{
 const controller=new HistoryController({} as GitBackend,{list:async()=>[],review:async()=>{throw Error('unused');},restore:async()=>{throw Error('unused');}},()=>false);
 const html=renderToStaticMarkup(<HistoryTab controller={controller} onRestored={async()=>{}}/>);
 assert.match(html,/aria-label="History"/); assert.match(html,/role="status"/); assert.match(html,/Local history only/); assert.match(html,/Refresh/);
});
test('history keys exist in every locale without touching other packages keys',()=>{
 for(const catalogue of Object.values(CATALOGUES)) for(const key of Object.keys(CATALOGUES.en).filter(k=>k.startsWith('versions.history.'))) assert.ok(catalogue[key],key);
});
