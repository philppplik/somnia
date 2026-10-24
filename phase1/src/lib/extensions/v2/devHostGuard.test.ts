import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import example from '../contracts/v2/example.json';
import {negotiateVersion,type HostCapabilities} from './compatibility';
import {sha256Hex as hashFixtureGuest} from './hostServices';
import {ExtensionError} from '../contracts/v2/api';

/**
 * Guards for the dev-fixture host's security posture (slice 2 review):
 * - Runtime negotiation is the compatibility gate on this beta line and is tested concretely.
 * - The fixture's permission grant stays the minimal read-only set.
 * - The bundled guest carries no network/eval/dynamic-import capability (source scan pins
 *   the property for THIS fixture; it is not a general sandbox guarantee).
 */
const host=(over:Partial<HostCapabilities>={}):HostCapabilities=>({somniaVersion:'12.3.0-beta.1',apiVersion:'2.0.0',protocolVersions:[1],runtimes:['js'],...over});

test('fixture negotiates against the real beta host and is rejected on wrong host versions',()=>{
 assert.deepEqual(negotiateVersion(example as never,host()),{apiVersion:'2.0.0',protocolVersion:1});
 for(const somniaVersion of ['11.5.0','13.0.0']){
  assert.throws(()=>negotiateVersion(example as never,host({somniaVersion})),(e:unknown)=>e instanceof ExtensionError&&e.code==='E_INCOMPATIBLE_API');
 }
 // A wasm-only host must not run the js fixture: no silent runtime unlock.
 assert.throws(()=>negotiateVersion(example as never,host({runtimes:['wasm']})),(e:unknown)=>e instanceof ExtensionError&&e.code==='E_INCOMPATIBLE_API');
});

test('fixture permission grant stays the minimal read-only set',()=>{
 assert.deepEqual([...example.permissions].sort(),['commands','project.read','ui.notify']);
});

test('guest digest is a real content hash of the bundled guest source',async()=>{
 const source=readFileSync(new URL('../contracts/v2/exampleGuest.ts',import.meta.url),'utf8');
 const digest=await hashFixtureGuest(source);
 assert.match(digest,/^[a-f0-9]{64}$/);
 // Binding is content-based: any byte change in the guest produces a different digest.
 assert.notEqual(await hashFixtureGuest(source+' '),digest);
 assert.equal(await hashFixtureGuest(source),digest);
});

test('bundled guest source has no network, eval or dynamic import capability',()=>{
 const source=readFileSync(new URL('../contracts/v2/exampleGuest.ts',import.meta.url),'utf8');
 for(const token of ['fetch(','XMLHttpRequest','WebSocket','EventSource','sendBeacon','eval(','new Function','import(']){
  assert.equal(source.includes(token),false,`guest must not contain ${token}`);
 }
});
