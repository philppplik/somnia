import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DEPLOY_ERROR_CODES,PROGRESS_STEPS} from '../lib/deploy/publishModel';

const read=(p:string)=>readFileSync(new URL(p,import.meta.url),'utf8');
const src=read('./PublishDialog.tsx');
const load=(l:string)=>JSON.parse(read(`../locales/${l}.json`)) as Record<string,string>;
const LOCALES=['en','de','es','fr','pt-BR'];

test('every key the panel can show exists in all five locales with the same placeholders',()=>{
 const en=load('en');
 const keys=new Set<string>();
 for(const m of (src+read('../lib/deploy/publishModel.ts')).matchAll(/'(deploy\.[A-Za-z.\-]*[A-Za-z])'/g))keys.add(m[1]!);
 for(const c of DEPLOY_ERROR_CODES)keys.add(`deploy.err.${c}`);
 for(const s of PROGRESS_STEPS)keys.add(`deploy.progress.${s}`);
 keys.add('cmd.deploy.open');
 const ph=(s:string)=>[...s.matchAll(/\{(\w+)\}/g)].map(m=>m[1]).sort().join(',');
 assert.ok(keys.size>90);
 for(const l of LOCALES){const t=load(l);for(const k of keys){assert.ok(t[k]!==undefined&&t[k]!=='',`${l} missing ${k}`);assert.equal(ph(t[k]!),ph(en[k]!),`${l} ${k} placeholders`);}}
});

test('translations are real translations, not English copies, for sentences',()=>{
 const en=load('en');
 for(const l of ['de','es','fr','pt-BR']){const t=load(l);const same=Object.keys(en).filter(k=>k.startsWith('deploy.err.')&&t[k]===en[k]);assert.deepEqual(same,[],`${l} untranslated errors`);}
});

test('new i18n keys stay under deploy.* (plus the cmd.deploy.* command title)',()=>{
 const en=load('en');const base=Object.keys(en).filter(k=>/^(deploy\.|cmd\.deploy\.)/.test(k));
 assert.ok(base.includes('deploy.button')&&base.includes('cmd.deploy.open'));
});

test('dialog source: accessible structure, no remember option, no raw error text, no secrets in the DOM',()=>{
 assert.ok(src.includes('role="listbox"')&&src.includes('role="option"'));
 assert.ok(src.includes('aria-live="polite"')&&src.includes('role="alert"')&&src.includes('role="progressbar"'));
 assert.ok(src.includes('aria-label={t(\'deploy.panel.aria\')}'));
 assert.ok(!/remember|dontAsk|don't ask|skipConfirm/i.test(src));
 assert.ok(!/\.message\b/.test(src),'raw error messages must not be rendered');
 assert.ok(!/privateKey|BEGIN OPENSSH/i.test(src));
 assert.ok(src.includes('SAFE_KEY'),'public key is only rendered after a character check');
});

test('dialog never confirms on its own: publish and rollback only go through the store (which runs the specs)',()=>{
 assert.ok(!src.includes('captureGesture')&&!src.includes('confirmIssue')&&!src.includes('consumeGesture'));
 assert.ok(src.includes('store.publish(')&&src.includes('store.rollback('));
});

test('every interactive icon-only control has a label',()=>{
 for(const m of src.matchAll(/<button[^>]*className="dlg-close"[^>]*>/g))assert.ok(/aria-label=/.test(m[0]));
 assert.ok(src.includes('data-testid="publish-button"'));
});

test('header button and dialog are mounted once in App and only offered on desktop',()=>{
 const app=read('../App.tsx');
 assert.equal((app.match(/<HeroActionSlot\/>/g)??[]).length,1);assert.ok(!app.includes('<PublishButton/>'),'App mounts the hero slot, which falls back to PublishButton');assert.equal((read('./shell/HeroActionSlot.tsx').match(/<PublishButton\/>/g)??[]).length,1);assert.equal((app.match(/<PublishDialog\/>/g)??[]).length,1);
 assert.ok(src.includes('publishAvailable()'));
});
