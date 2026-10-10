import test from 'node:test';
import assert from 'node:assert/strict';
import {activityTabs,badgeText,canInstall,describeChange,filterInstalled,groupByDay,grantsFromManifest,isEmptyLog,locate,navCounts,permissionTags,shortHash,showsSignedMatch,sortNewest,switchState,toActivityFilter} from './popupModel';
import {FIXTURE_EVENTS,FIXTURE_EXTENSIONS} from './popupFixtures';
import {parseManifestV2} from './manifestV2';

const ext=(id:string)=>FIXTURE_EXTENSIONS.find(e=>e.id.endsWith(id))!;
test('zero badges are hidden; installed counts disabled extensions; updates count pending consent only',()=>{
 assert.equal(badgeText(0),null);assert.equal(badgeText(4),'4');
 assert.deepEqual(navCounts(FIXTURE_EXTENSIONS),{installed:4,updates:1});
});
test('tags show at most two, highest risk first, with an overflow count',()=>{
 const g=(key:any,id=key)=>({id,key,control:'toggle' as const,granted:true});
 const r=permissionTags({grants:[g('project.read'),g('network','network:a'),g('network','network:b'),g('project.write')]});
 assert.deepEqual(r.tags.map(t=>t.key),['project.write','network']);assert.equal(r.tags[1].count,2);assert.equal(r.overflow,1);
 assert.equal(permissionTags({grants:[]}).none,true);
});
test('a revoked grant does not count as granted',()=>{
 assert.equal(permissionTags({grants:[{id:'project.write',key:'project.write',control:'toggle',granted:false}]}).none,true);
});
test('blocked extension cannot show an enabled switch',()=>{
 assert.deepEqual(switchState({enabled:true,status:'blocked'},false),{checked:false,canEnable:false});
 assert.equal(switchState({enabled:false,status:'disabled'},true).canEnable,false);
});
test('installed filters combine text and state',()=>{
 assert.equal(filterInstalled(FIXTURE_EXTENSIONS,'','enabled').length,3);
 assert.equal(filterInstalled(FIXTURE_EXTENSIONS,'tidy','all')[0].name,'Tidy HTML');
 assert.equal(filterInstalled(FIXTURE_EXTENSIONS,'','themes')[0].name,'Coffee Shop+');
});
test('activity filters map onto the host query and the Network chip uses kind',()=>{
 assert.deepEqual(toActivityFilter({extensionId:null,chip:'network',text:' '}),{kind:'network'});
 assert.deepEqual(toActivityFilter({extensionId:'a',chip:'denied',text:'index'}),{extensionId:'a',decision:'denied',search:'index'});
 assert.deepEqual(toActivityFilter({extensionId:null,chip:'prompts',text:''}),{decision:'prompted'});
});
test('log state keeps unreadable apart from empty',()=>{
 assert.equal(isEmptyLog({status:'error'}),false);assert.equal(isEmptyLog({status:'loading'}),false);
 assert.equal(isEmptyLog({status:'ready',events:[],nextOffset:null,total:0}),true);
});
test('events sort newest first and group by local day; removed extensions keep their label',()=>{
 const s=sortNewest(FIXTURE_EVENTS);assert.equal(s[0].id,'e6');
 assert.equal(groupByDay(FIXTURE_EVENTS,'UTC').length>=1,true);
 const tabs=activityTabs([{id:'example.tidy-html',name:'Tidy HTML'}],FIXTURE_EVENTS);
 assert.equal(tabs.find(t=>t.id==='example.svg-optimizer')?.removed,true);assert.equal(tabs[0].removed,false);
});
test('signed-match needs a real match and a well-formed digest',()=>{
 const h='a'.repeat(64);
 assert.equal(showsSignedMatch({provider:'x',verification:'signed-match',sha256:h}),true);
 assert.equal(showsSignedMatch({provider:'x',verification:'signed-match',sha256:'abc'}),false);
 assert.equal(showsSignedMatch({provider:'x',verification:'no-signed-match',sha256:h}),false);
 assert.equal(shortHash(h),'aaaaaa\u2026aaaa');
});
test('install stays disabled for unreviewed, invalid or native-without-developer-mode candidates',()=>{
 const base={kind:'ready' as const,id:'a',name:'a',version:'1',origin:'o',engine:'e',verification:'signed-match' as const,native:false,grants:[]};
 assert.equal(canInstall(base,false,false),false);assert.equal(canInstall(base,false,true),true);
 assert.equal(canInstall({...base,verification:'invalid'},true,true),false);
 assert.equal(canInstall({...base,native:true},false,true),false);assert.equal(canInstall({...base,native:true},true,true),true);
 assert.equal(canInstall({kind:'manifestOnly',id:'a',name:'a',version:'1'},true,true),false);
});
test('update diff codes get a label key and keep the raw detail',()=>{
 assert.deepEqual(describeChange('network.api.example.com'),{key:'ext.change.network',arg:'api.example.com'});
 assert.equal(describeChange('weird').key,'ext.change.other');
});
test('locate reads line and column from parser messages',()=>{
 assert.deepEqual(locate('Unexpected token at line 3, column 9'),{line:3,column:9});assert.deepEqual(locate('nothing'),{});
});
test('grant rows come from a v2 manifest: declared is not granted, revoked stays listed but off',()=>{
 const r=parseManifestV2(`manifestVersion = 2
id = "example.t"
publisher = "example"
name = "T"
version = "1.0.0"
description = "d"
license = "MIT"
permissions = []
activationEvents = []
dependencies = []
[engines]
somnia = ">=11.0.0 <12.0.0"
api = ">=2.0.0 <3.0.0"
[runtime]
type = "declarative"
[capabilities.untrustedWorkspaces]
supported = "supported"
[capabilities.virtualWorkspaces]
supported = true
[contributes]
[security]
tier = "A"
[security.fs]
read = "project"
write = "none"
[[security.network]]
host = "api.example.com"
reason = "Fetch data for the live panel"
`,{lane:'experimental'});
 if(!r.ok)assert.fail(JSON.stringify(r.errors));
 const rows=grantsFromManifest(r.manifest,{revoked:['network:api.example.com']});
 assert.deepEqual(rows.map(x=>[x.id,x.granted]),[['project.read',true],['network:api.example.com',false]]);
 assert.equal(rows[1].reason,'Fetch data for the live panel');
});
