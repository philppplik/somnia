import {test} from 'node:test';
import assert from 'node:assert/strict';
import {stringify} from 'smol-toml';
import example from './contracts/v2/example.json';
import {isSafePackagePath,isValidWhen,parseManifestV2,validateManifestV2} from './manifestV2';
const fresh=()=>structuredClone(example);
const invalid=(m:unknown,path:string,options={})=>{const r=validateManifestV2(m,options); assert.equal(r.ok,false); if(!r.ok) assert(r.errors.some(e=>e.path===path),JSON.stringify(r.errors));};
test('reference manifest validates as TOML with explicit engine negotiation',()=>{
 const r=parseManifestV2(stringify(fresh()),{somniaVersion:'11.3.0',apiVersion:'2.0.0'});
 assert.equal(r.ok,true); if(r.ok) assert.deepEqual(JSON.parse(JSON.stringify(r.manifest)),example);
 invalid(fresh(),'/engines/api',{apiVersion:'1.0.0'});
 invalid(fresh(),'/engines/somnia',{somniaVersion:'12.0.0'});
});
test('TOML rejects duplicate keys, invalid UTF8, JSON, and byte budget',()=>{
 for(const value of ['id="a"\nid="b"',JSON.stringify(example),new Uint8Array([0xff]),'x'.repeat(262145)]) {
  const r=parseManifestV2(value); assert.equal(r.ok,false); if(!r.ok) assert.equal(r.errors[0].code,'SOM-EXT-001');
 }
});
test('closed schema collects nested unknown keys with escaped JSON pointers',()=>{
 const m:any=fresh(); m['bad/key']=true; m.runtime.other=true; delete m.name;
 const r=validateManifestV2(m); assert.equal(r.ok,false);
 if(!r.ok) {for(const p of ['/bad~1key','/runtime/other','/name']) assert(r.errors.some(e=>e.path===p));}
});
test('legacy JSON shape never enters v2',()=>{invalid({apiVersion:1,id:'acme.old',code:'x'},'/manifestVersion');});
test('publisher, license, duplicate and namespaced contributions are checked',()=>{
 const m=fresh(); m.publisher='other'; invalid(m,'/publisher');
 const l=fresh(); l.license='definitely-not-a-license'; invalid(l,'/license');
 const dup=fresh(); dup.contributes.commands.push(dup.contributes.commands[0]); invalid(dup,'/contributes/commands/1/id');
 const id=fresh(); id.contributes.commands[0].id='other.name.count'; invalid(id,'/contributes/commands/0/id');
});
test('engine comparator sets need bounds and API remains major 2',()=>{
 for(const range of ['*','^2.0.0','latest','>=2.0.0','>=1.0.0 <3.0.0','>=2.0.0 <4.0.0','>=2.0.0 <3.0.0 || *','>=3.0.0 <2.0.0']) {const m=fresh(); m.engines.api=range; invalid(m,'/engines/api');}
});
test('safe paths reject devices, separators and traversal, not harmless dots',()=>{
 for(const path of ['/a','../a','a/../b','a\\b','C:a','a//b','a/.','NUL.txt','a/COM1','trailing.','a/space ','a\x00b']) assert.equal(isSafePackagePath(path),false,path);
 assert.equal(isSafePackagePath('dist/file..name.js'),true);
});
test('bounded context grammar accepts intended booleans, never executable code',()=>{
 for(const expr of ['hasProject && studio == "code"','!workspaceTrusted || (hasSelection && !isReadonly)','true']) assert.equal(isValidWhen(expr),true,expr);
 for(const expr of ['fetch("url")','project.name','studio =~ "code"','studio == otherKey','unknown','(((((((((true)))))))))','true; alert(1)','']) assert.equal(isValidWhen(expr),false,expr);
});
test('permissions and activation correspondence are checked',()=>{
 const m=fresh(); m.activationEvents=[]; invalid(m,'/contributes/commands/0');
 const p=fresh(); p.permissions=[]; invalid(p,'/contributes/commands/0');
 const a=fresh(); a.activationEvents.push('onCommand:acme.word-count.missing'); invalid(a,'/activationEvents/2');
 const g=fresh(); g.activationEvents.push('workspaceContains:../secret'); invalid(g,'/activationEvents/2');
 const s=fresh(); s.activationEvents.push('onSelectionChanged'); invalid(s,'/activationEvents/2');
});
test('declarative runtime has no executable contributions and static panels need no activation',()=>{
 const m:any=fresh(); m.runtime={type:'declarative'}; m.activationEvents=[]; m.contributes.commands=[]; m.permissions=[];
 assert.equal(validateManifestV2(m).ok,true); m.contributes.panels[0].scripts=true; invalid(m,'/contributes/panels/0/scripts');
});
test('limited workspace permissions cannot widen declared permissions',()=>{
 const m:any=fresh(); m.capabilities.untrustedWorkspaces={supported:'limited',description:'Read-only summary',allowedPermissions:['project.write']}; invalid(m,'/capabilities/untrustedWorkspaces/allowedPermissions');
});
test('restricted argument schemas reject references and arbitrary keywords',()=>{
 const m:any=fresh(); m.contributes.commands[0].argumentsSchema={type:'object',properties:{x:{$ref:'https://evil.invalid/schema'}}}; invalid(m,'/contributes/commands/0/argumentsSchema/properties/x/$ref');
 m.contributes.commands[0].argumentsSchema={type:'object',properties:{x:{type:'string',maxLength:30}},additionalProperties:false}; assert.equal(validateManifestV2(m).ok,true);
});
test('prototype names cannot enter manifest objects',()=>{
 const m:any=fresh(); m.contributes.commands[0].argumentsSchema=JSON.parse('{"properties":{"__proto__":{"type":"string"}}}'); invalid(m,'/contributes/commands/0/argumentsSchema/properties/__proto__');
});
test('store policy refuses eager activation and proposed APIs require experimental lane',()=>{
 const m=fresh(); m.activationEvents.push('*'); invalid(m,'/activationEvents/2',{lane:'store'});
 const p:any=fresh(); p.proposedApis=[{id:'studio-selection',revision:1}]; invalid(p,'/proposedApis'); assert.equal(validateManifestV2(p,{lane:'experimental'}).ok,true);
});
test('successful validation returns an independent frozen manifest',()=>{
 const m=fresh(); const r=validateManifestV2(m); assert.equal(r.ok,true);
 if(r.ok) {m.name='Changed'; assert.equal(r.manifest.name,'Word count'); assert(Object.isFrozen(r.manifest)); assert(Object.isFrozen(r.manifest.contributes));}
});
test('large comment blocks and malformed TOML terminate with current pinned parser',()=>{
 const r=parseManifestV2('# comment\n'.repeat(12000)+stringify(fresh())); assert.equal(r.ok,true);
 assert.equal(parseManifestV2('x = "unterminated').ok,false);
});
