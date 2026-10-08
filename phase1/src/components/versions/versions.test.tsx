import test from 'node:test';
import {ChangesView} from './ChangesTab';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import {ChangesController} from './controller';
import {createFakeBackend,fakeChange,fakeRepo} from './fakeBackend';
import {suggestSubject} from './commitText';
import {defaultSelection,reconcileSelection} from './selection';
import {parseGitError} from './backend';
import {countUnsaved} from './VersionsHost';
import {translate} from '../../lib/i18n';
import {CATALOGUES} from '../../lib/i18n';

const t=(k:string,p?:Record<string,string|number>)=>translate('en',k,p);
const tde=(k:string,p?:Record<string,string|number>)=>translate('de',k,p);
const mk=(b=createFakeBackend({changes:[fakeChange('index.html'),fakeChange('css/site.css'),fakeChange('.DS_Store',{kind:'untracked',suggestSkip:true}),fakeChange('x.html',{kind:'conflicted'})]}))=>({b,c:new ChangesController(b,t)});

test('default selection skips suggested-skip and conflicted files',async()=>{
 const {c}=mk();await c.refresh();
 assert.deepEqual([...c.getState().selected].sort(),['css/site.css','index.html']);});
test('auto suggestion follows the selection until the user edits the name',async()=>{
 const {c}=mk();await c.refresh();assert.match(c.getState().subject,/^Update 2 files: /);
 c.toggle('css/site.css');assert.equal(c.getState().subject,'Update index.html');
 c.setSubject('My name');c.toggle('css/site.css');assert.equal(c.getState().subject,'My name');
 c.setSubject('');assert.equal(c.getState().subject,suggestSubject(c.selectedChanges(),t));});
test('nothing is committed without an explicit commit() call',async()=>{
 const {b,c}=mk();await c.refresh();assert.ok(!b.calls.includes('commit'));assert.equal(b.commits.length,0);});
test('commit sends exactly the ticked paths, the edited subject and the reviewed stateToken',async()=>{
 const {b,c}=mk();await c.refresh();c.toggle('css/site.css');c.setSubject('Fix title');c.setBody(' notes ');
 const v=await c.commit();assert.ok(v);
 assert.deepEqual(b.commits,[{paths:['index.html'],subject:'Fix title',body:'notes',stateToken:'t1'}]);
 const s=c.getState();assert.equal(s.saved?.subject,'Fix title');assert.equal(s.subjectTouched,false);assert.equal(s.subject,'');assert.equal(s.body,'');
 assert.ok(!s.selected.has('index.html'));assert.ok(!s.selected.has('css/site.css'),'unticked stays unticked');});
test('cannot save with empty selection or empty/over-long name',async()=>{
 const {b,c}=mk();await c.refresh();c.selectAll(false);assert.equal(c.canSave(),false);assert.equal(await c.commit(),null);
 c.selectAll(true);c.setSubject('x'.repeat(201));assert.equal(c.canSave(),false);
 c.setSubject('ok');assert.equal(c.canSave(),true);assert.equal(b.commits.length,0);});
test('state-changed reloads, keeps ticks and asks to review again; nothing saved',async()=>{
 const {b,c}=mk();await c.refresh();b.token=2;
 assert.equal(await c.commit(),null);const s=c.getState();
 assert.equal(s.reviewAgain,true);assert.equal(s.status?.stateToken,'t2');assert.equal(b.commits.length,0);assert.ok(s.selected.has('index.html'));
 assert.ok(await c.commit(),'second save with the fresh token works');});
test('backend errors surface as codes without raw detail in the default view',async()=>{
 const {b,c}=mk();await c.refresh();b.failNextCommit={code:'hook-failed',message:'x',detail:'secret/path'};
 assert.equal(await c.commit(),null);assert.equal(c.getState().error?.code,'hook-failed');
 const html=renderToStaticMarkup(<ChangesView s={c.getState()} c={c} t={t} unsavedFiles={0} advanced={false} onSaveFiles={()=>{}}/>);
 assert.ok(html.includes(t('versions.error.hook-failed')));assert.ok(!html.includes('secret/path'));
 const adv=renderToStaticMarkup(<ChangesView s={c.getState()} c={c} t={t} unsavedFiles={0} advanced={true} onSaveFiles={()=>{}}/>);
 assert.ok(adv.includes('secret/path'));});
test('non-ready repo states show a plain message; no-repo offers init and init works',async()=>{
 const b=createFakeBackend({state:{kind:'no-repo',root:'/p'}});const c=new ChangesController(b,t);await c.refresh();
 assert.equal(c.getState().phase,'repo');
 const html=renderToStaticMarkup(<ChangesView s={c.getState()} c={c} t={t} unsavedFiles={0} advanced={false} onSaveFiles={()=>{}}/>);
 assert.ok(html.includes('versions-init'));assert.ok(!/\bgit init\b/.test(html));
 await c.init();assert.equal(c.getState().phase,'ready');assert.ok(b.calls.includes('init'));
 for(const r of ['index-lock','merge-in-progress','rebase-in-progress','cherry-pick-in-progress','invalid-repo','untrusted-repo','unsupported-worktree'] as const){
  const bb=createFakeBackend({state:{kind:'blocked',reason:r}});const cc=new ChangesController(bb,t);await cc.refresh();
  assert.ok(renderToStaticMarkup(<ChangesView s={cc.getState()} c={cc} t={t} unsavedFiles={0} advanced={false} onSaveFiles={()=>{}}/>).includes(t(`versions.blocked.${r}`)),r);}
 const nb=createFakeBackend({state:{kind:'no-git'}});const nc=new ChangesController(nb,t);await nc.refresh();assert.equal(nc.getState().phase,'repo');});
test('status failure becomes an error state, a stale refresh cannot overwrite a newer one',async()=>{
 const {b,c}=mk();b.failStatus={code:'timeout',message:'t'};await c.refresh();assert.equal(c.getState().phase,'error');
 b.failStatus=null;await Promise.all([c.refresh(),c.refresh()]);assert.equal(c.getState().phase,'ready');});
test('view: unsaved buffers are called out and are not part of the list; a11y labels and non-colour kind text',async()=>{
 const {c}=mk();await c.refresh();
 const html=renderToStaticMarkup(<ChangesView s={c.getState()} c={c} t={t} unsavedFiles={2} advanced={false} onSaveFiles={()=>{}}/>);
 assert.ok(html.includes('versions-unsaved'));assert.ok(html.includes('2 files have edits that are not saved to disk'));
 assert.ok(html.includes('aria-label="Include index.html in this version"'));
 assert.ok(html.includes('Changed')&&html.includes('Conflict'));
 assert.ok(/<input[^>]*disabled[^>]*aria-label="Include x.html/.test(html)||/aria-label="Include x.html[^>]*>/.test(html));
 assert.ok(!html.includes('staged')&&!html.includes('commit'),'simple mode has no Git words');
 const adv=renderToStaticMarkup(<ChangesView s={c.getState()} c={c} t={t} unsavedFiles={0} advanced={true} onSaveFiles={()=>{}}/>);
 assert.ok(adv.includes('Save version (commit)')&&adv.includes('Changed (modified)')&&adv.includes('main'));
 assert.ok(!adv.includes('versions-unsaved'));});
test('view: warnings for LFS, submodules, detached HEAD and project subfolder',async()=>{
 const b=createFakeBackend({state:{kind:'ready',repo:fakeRepo({hasLfs:true,hasSubmodules:true,detached:true,branch:null,projectPrefix:'site'})},changes:[]});
 const c=new ChangesController(b,t);await c.refresh();
 const html=renderToStaticMarkup(<ChangesView s={c.getState()} c={c} t={t} unsavedFiles={0} advanced={false} onSaveFiles={()=>{}}/>);
 for(const k of ['lfs','submodules','detached','prefix'])assert.ok(html.includes(t(`versions.warn.${k}`)),k);
 assert.ok(html.includes('versions-none'));});
test('suggestions: single, rename, many, mixed, clipping',()=>{
 assert.equal(suggestSubject([fakeChange('a/b.css',{kind:'added'})],t),'Add b.css');
 assert.equal(suggestSubject([fakeChange('a/b.css',{kind:'deleted'})],t),'Remove b.css');
 assert.equal(suggestSubject([fakeChange('n.html',{kind:'renamed',oldPath:'o.html'})],t),'Rename o.html to n.html');
 assert.equal(suggestSubject([fakeChange('a'),fakeChange('b'),fakeChange('c'),fakeChange('d')],t),'Update 4 files: a, b, +2 more');
 assert.equal(suggestSubject([fakeChange('a',{kind:'added'}),fakeChange('b',{kind:'untracked'})],t),'Add 2 files: a, b');
 assert.equal(suggestSubject([],t),'');
 assert.ok(suggestSubject([fakeChange('x'.repeat(300))],t).length<=200);
 assert.equal(suggestSubject([fakeChange('index.html')],tde),'index.html aktualisieren');});
test('selection reconcile keeps ticks, defaults new files, drops gone files',()=>{
 const a=[fakeChange('a'),fakeChange('b')];const after=[fakeChange('b'),fakeChange('c'),fakeChange('.DS_Store',{suggestSkip:true})];
 assert.deepEqual([...reconcileSelection(new Set(['b']),a,after)].sort(),['b','c']);
 assert.deepEqual([...reconcileSelection(new Set(),a,after)].sort(),['c']);
 assert.deepEqual([...defaultSelection(a)],['a','b']);});
test('parseGitError handles JSON strings, objects and junk',()=>{
 assert.equal(parseGitError('{"code":"io","message":"m","detail":"d"}').code,'io');
 assert.equal(parseGitError({code:'timeout',message:''}).code,'timeout');
 assert.equal(parseGitError('boom').code,'unknown');assert.equal(parseGitError(null).code,'unknown');});
test('countUnsaved compares editor text with disk text',()=>{
 const saved:Record<string,string>={'a':'1','b':'2'};
 assert.equal(countUnsaved({a:'1',b:'x',c:'new'},f=>saved[f]??''),2);});
test('every versions.* key exists in all locales, with matching placeholders; DE is translated',()=>{
 const base=Object.keys(CATALOGUES.en).filter(k=>k.startsWith('versions.'));assert.ok(base.length>60);
 for(const [l,cat] of Object.entries(CATALOGUES))for(const k of base)assert.ok(k in cat,`${l}:${k}`);
 const same=base.filter(k=>CATALOGUES.de[k]===CATALOGUES.en[k]&&!['versions.error.detail','versions.history.version'].includes(k));assert.deepEqual(same,[]);});
test('every GitErrorCode and block reason has a message',()=>{
 for(const c of ['git-missing','not-a-repo','blocked','state-changed','nothing-to-commit','hook-failed','signing-failed','identity-missing','path-rejected','timeout','cancelled','too-large','io','unknown'])assert.ok(CATALOGUES.en[`versions.error.${c}`],c);});
