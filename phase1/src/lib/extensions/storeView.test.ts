import test from 'node:test';
import assert from 'node:assert/strict';
import {EMPTY_FEED,FIXTURE_NOW,POLICY,fixtureCatalog,fixtureEvidence,makeRelease,manifestFor} from './storeFixtures';
import {accessRows,buildCards,candidateBound,categoriesOf,compareVersions,evidenceRows,filesTag,filterCards,installPaused,isVerifiedPublisher,networkTag,storeRelease} from './storeView';
import {CATALOGUES} from '../i18n';
import {STORE_CATALOGUES} from './storeLocales';
import type {Capability} from './store';

const t=(k:string,p?:Record<string,string|number>)=>CATALOGUES.en[k]?.replace(/\{(\w+)\}/g,(_,n)=>String(p?.[n]))??k;
const cat=fixtureCatalog();const none=new Map<string,string>();
const cards=(inst=none,feed=EMPTY_FEED)=>buildCards(cat,feed,inst,FIXTURE_NOW);
const card=(id:string,inst=none,feed=EMPTY_FEED)=>cards(inst,feed).find(c=>c.id===id)!;
const cap=(key:string,scope='project'):Capability=>({key,scope,reason:'r'});

test('semver ordering: stable beats prerelease, numeric parts compare as numbers',()=>{
 assert.equal(compareVersions('1.10.0','1.9.0'),1);assert.equal(compareVersions('1.0.0','1.0.0-rc.1'),1);assert.equal(compareVersions('1.0.0-rc.2','1.0.0-rc.10'),-1);assert.equal(compareVersions('2.0.0','2.0.0'),0);
});
test('verified mark needs a current domain check; official is separate; lapsed or pending removes it',()=>{
 const p=(id:string)=>cat.publishers.find(x=>x.id===id)!;
 assert.equal(isVerifiedPublisher(p('northfield'),FIXTURE_NOW),true);
 assert.equal(isVerifiedPublisher(p('sam-rivera'),FIXTURE_NOW),false,'80 day old domain check has lapsed');
 assert.equal(isVerifiedPublisher(p('hq'),FIXTURE_NOW),false);assert.equal(p('hq').official,true);
 assert.equal(isVerifiedPublisher({...p('northfield'),domain:{...p('northfield').domain!,state:'suspended'}},FIXTURE_NOW),false);
 assert.equal(isVerifiedPublisher({...p('northfield'),state:'frozen'},FIXTURE_NOW),false);
 assert.equal(isVerifiedPublisher(undefined,FIXTURE_NOW),false);
});
test('cards: suspended hidden, blocked shown as blocked, installed and update states',()=>{
 const all=cards();assert.equal(all.some(c=>c.id==='pixel-garden.hidden-tool'),false);
 assert.equal(card('open-frames.quick-fonts').state,'blocked');
 assert.equal(card('hq.html-mail-kit',new Map([['hq.html-mail-kit','1.3.0']])).state,'installed');
 assert.equal(card('lena-okafor.css-tidy',new Map([['lena-okafor.css-tidy','1.5.0']])).state,'update');
 assert.equal(card('northfield.palette-lint').state,'install');
 assert.equal(card('brightside.coffee-themes').deprecated,true);
});
test('signed security feed blocks a listed release by digest and hides a suspended one',()=>{
 const r=card('northfield.palette-lint').release;
 const feed={...EMPTY_FEED,incidents:[{incidentId:'i1',sequence:8,action:'security-blocked' as const,versions:[],digests:[r.artifact.sha256],reason:'malware' as const,issuedAt:'2026-10-10T00:00:00.000Z',reviewStatus:'confirmed' as const,summary:'x',appealUrl:'https://x.example'}]};
 assert.equal(card('northfield.palette-lint',none,feed).state,'blocked');
 const sus={...EMPTY_FEED,incidents:[{...feed.incidents[0],incidentId:'i2',action:'policy-suspended' as const,digests:[],extensionId:'northfield.palette-lint',versions:['1.0.0']}]};
 assert.equal(cards(none,sus).some(c=>c.id==='northfield.palette-lint'),false);
 const cleared={...feed,incidents:[...feed.incidents,{...feed.incidents[0],incidentId:'i3',sequence:9,reviewStatus:'cleared' as const,supersedes:'i1'}]};
 assert.equal(card('northfield.palette-lint',none,cleared).state,'install');
});
test('storeRelease picks the highest stable visible version and ignores prerelease',()=>{
 const l=structuredClone(cat.extensions.find(e=>e.id==='lena-okafor.css-tidy')!);
 l.releases.push(makeRelease(l.id,'2.0.0-rc.1','lena-okafor',[],[], 'listed','prerelease'));
 assert.equal(storeRelease(l,EMPTY_FEED)!.version,'1.6.0');
});
test('access tags: file and network tags come from capabilities and disclosures',()=>{
 assert.equal(card('margot-weiss.ftp-deploy').files,'read');assert.equal(card('hq.html-mail-kit').files,'write');assert.equal(card('brightside.coffee-themes').files,'none');
 assert.deepEqual(card('margot-weiss.ftp-deploy').network,{kind:'hosts',count:1});assert.deepEqual(card('sam-rivera.link-checker').network,{kind:'many'});assert.deepEqual(card('northfield.palette-lint').network,{kind:'none'});
 assert.equal(filesTag(makeRelease('a.b','1.0.0','a',[cap('fs.write','none')])),'none');
 assert.deepEqual(networkTag(makeRelease('a.b','1.0.0','a',[cap('network','h.example')])),{kind:'hosts',count:1});
});
test('access rows: closed vocabulary, network host named, unknown key never shows a raw id and blocks install',()=>{
 const rows=accessRows(card('margot-weiss.ftp-deploy').release);
 assert.deepEqual(rows.map(r=>r.titleKey),['store.perm.project.read','store.perm.network','store.perm.secrets']);
 assert.equal(rows[1].params!.host,'sftp.example-host.com');assert.equal(rows[1].amber,true);
 const bad=makeRelease('a.b','1.0.0','a',[cap('shell.exec','all')]);
 const r=accessRows(bad);assert.equal(r[0].titleKey,'store.perm.unknown');assert.equal(JSON.stringify(r).includes('shell.exec'),false);
 for(const row of accessRows(card('sam-rivera.link-checker').release))assert.notEqual(t(row.titleKey,row.params),row.titleKey,'every title resolves in English');
});
test('every plain-language permission key exists in all locales',()=>{
 const keys=['project.read','project.write','fs.read.project','fs.read.ask','fs.write.project','fs.write.ask','network','clipboard.read','clipboard.write','agent','secrets','commands','selection','ui.notify','storage','unknown'];
 for(const l of Object.keys(STORE_CATALOGUES))for(const k of keys)assert.ok(STORE_CATALOGUES[l][`store.perm.${k}`],`${l} ${k}`);
});
test('search covers name, publisher, permission text and hosts; category filters',()=>{
 const all=cards();
 assert.deepEqual(filterCards(all,'northfield','all',t).map(c=>c.id).sort(),['northfield.lorem-studio','northfield.palette-lint']);
 assert.deepEqual(filterCards(all,'keyring','all',t).map(c=>c.id),['margot-weiss.ftp-deploy']);
 assert.deepEqual(filterCards(all,'many hosts','all',t).map(c=>c.id),['sam-rivera.link-checker']);
 assert.equal(filterCards(all,'','Deploy',t).length,1);
 assert.deepEqual(categoriesOf(all),['Accessibility','Components','Deploy','Email','Images','Themes']);
});
test('evidence rows: six rows, dependency check goes overdue after 72h, missing evidence is not green',()=>{
 const r=card('margot-weiss.ftp-deploy').release;
 const rows=evidenceRows(r,fixtureEvidence(r,{dependenciesAgeMs:5*86400000}),POLICY,FIXTURE_NOW,FIXTURE_NOW-7200000);
 assert.deepEqual(rows.map(x=>x.id),['review','provenance','scan','dependencies','permission','revocation']);
 assert.equal(rows.find(x=>x.id==='dependencies')!.tone,'warn');assert.equal(rows.find(x=>x.id==='review')!.tone,'ok');
 const missing=evidenceRows(r,null,POLICY,FIXTURE_NOW,FIXTURE_NOW-7200000);
 assert.deepEqual(missing.filter(x=>x.tone==='ok').map(x=>x.id),['revocation']);
 assert.equal(missing.find(x=>x.id==='review')!.status,'not-run');
});
test('evidence bound to other bytes or another commit is ignored, a single reviewer is not enough for high risk',()=>{
 const r=card('margot-weiss.ftp-deploy').release;const ev=fixtureEvidence(r)!;
 assert.equal(evidenceRows(r,{...ev,packageSha256:'0'.repeat(64)},POLICY,FIXTURE_NOW,FIXTURE_NOW).find(x=>x.id==='scan')!.status,'not-run');
 assert.equal(evidenceRows(r,{...ev,sourceCommit:'1'.repeat(40)},POLICY,FIXTURE_NOW,FIXTURE_NOW).find(x=>x.id==='provenance')!.status,'not-run');
 assert.equal(evidenceRows(r,{...ev,reviews:ev.reviews.slice(0,1)},POLICY,FIXTURE_NOW,FIXTURE_NOW).find(x=>x.id==='review')!.tone,'warn');
 assert.equal(evidenceRows(r,{...ev,reviews:ev.reviews.map(x=>({...x,policyRevision:'old'}))},POLICY,FIXTURE_NOW,FIXTURE_NOW).find(x=>x.id==='review')!.tone,'warn');
 const failed={...ev,gates:ev.gates.map(g=>g.gate==='malware'?{...g,status:'fail' as const}:g)};
 assert.equal(evidenceRows(r,failed,POLICY,FIXTURE_NOW,FIXTURE_NOW).find(x=>x.id==='scan')!.tone,'bad');
});
test('revocation check reflects catalog freshness; install pauses after seven days or a clock rollback',()=>{
 const r=card('northfield.palette-lint').release;const rev=(last:number|null)=>evidenceRows(r,fixtureEvidence(r),POLICY,FIXTURE_NOW,last).find(x=>x.id==='revocation')!;
 assert.equal(rev(FIXTURE_NOW-1000).tone,'ok');assert.equal(rev(FIXTURE_NOW-8*3600000).tone,'warn');assert.equal(rev(null).tone,'warn');
 assert.equal(installPaused(FIXTURE_NOW-3600000,FIXTURE_NOW),false);assert.equal(installPaused(FIXTURE_NOW-8*86400000,FIXTURE_NOW),true);assert.equal(installPaused(FIXTURE_NOW+1000,FIXTURE_NOW),true);assert.equal(installPaused(null,FIXTURE_NOW),true);
});
test('candidate binding: store source, same id, version and package digest',()=>{
 const c=card('northfield.palette-lint');const r=c.release;
 const base={manifest:manifestFor(r,c.name,'northfield'),artifactHash:r.artifact.sha256,source:'store',validation:'valid'};
 assert.equal(candidateBound(base,r),true);
 assert.equal(candidateBound({...base,artifactHash:'f'.repeat(64)},r),false);
 assert.equal(candidateBound({...base,source:'manual'},r),false);
 assert.equal(candidateBound({...base,validation:'invalid'},r),false);
 assert.equal(candidateBound({...base,manifest:{...base.manifest,version:'9.9.9'}},r),false);
 assert.equal(candidateBound({...base,manifest:{...base.manifest,id:'evil.palette-lint'}},r),false);
});
test('store locales: same keys and placeholders in all five languages, no em dashes',()=>{
 const en=STORE_CATALOGUES.en;const ph=(s:string)=>(s.match(/\{\w+\}/g)??[]).sort().join();
 assert.deepEqual(Object.keys(STORE_CATALOGUES).sort(),['de','en','es','fr','pt-BR']);
 for(const [l,c] of Object.entries(STORE_CATALOGUES)){assert.deepEqual(Object.keys(c).sort(),Object.keys(en).sort(),l);for(const k of Object.keys(en)){assert.equal(ph(c[k]),ph(en[k]),`${l} ${k}`);assert.equal(/[\u2014\u2013]/.test(c[k]),false,`${l} ${k}`);}}
 for(const l of Object.keys(STORE_CATALOGUES))assert.equal(CATALOGUES[l]['store.install'],STORE_CATALOGUES[l]['store.install']);
});
