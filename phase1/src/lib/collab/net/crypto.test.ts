import test from 'node:test';
import assert from 'node:assert/strict';
import {newLinkKey,importLinkKey,encryptFrame,decryptFrame,isEncryptedFrame,linkKeyParam,toBase64Url,fromBase64Url} from './crypto';
import {encodeSyncStep1,MSG_SYNC} from './protocol';
import * as Y from 'yjs';

test('link key: generate, encode, import; fingerprint is stable and short',async()=>{
 const {param,link}=await newLinkKey();
 assert.match(param,/^[A-Za-z0-9_-]{43}$/); // 32 bytes base64url, URL-fragment safe
 assert.match(link.fingerprint,/^[0-9a-f]{8}$/);
 const again=await importLinkKey(param);
 assert.equal(again.fingerprint,link.fingerprint);});

test('importLinkKey rejects bad input',async()=>{
 await assert.rejects(()=>importLinkKey('tooshort'));
 await assert.rejects(()=>importLinkKey('a'.repeat(44)+'!'));
 await assert.rejects(()=>importLinkKey(toBase64Url(new Uint8Array(16))));});

test('encrypt/decrypt round trip; tampering and wrong key fail',async()=>{
 const {link}=await newLinkKey();
 const frame=encodeSyncStep1(new Y.Doc());
 const enc=await encryptFrame(link,frame);
 assert.ok(isEncryptedFrame(enc));
 assert.notDeepEqual([...enc],[...frame]);
 assert.deepEqual([...await decryptFrame(link,enc)],[...frame]);
 assert.equal((await decryptFrame(link,enc))[0],MSG_SYNC);
 const other=await newLinkKey();
 await assert.rejects(()=>decryptFrame(other.link,enc));
 const bad=new Uint8Array(enc);bad[bad.length-1]^=1;
 await assert.rejects(()=>decryptFrame(link,bad));
 await assert.rejects(()=>decryptFrame(link,frame)); // not an encrypted frame
});

test('two encryptions of the same frame differ (random nonce)',async()=>{
 const {link}=await newLinkKey();const f=encodeSyncStep1(new Y.Doc());
 const a=await encryptFrame(link,f),b=await encryptFrame(link,f);
 assert.notDeepEqual([...a],[...b]);
 assert.deepEqual([...await decryptFrame(link,a)],[...await decryptFrame(link,b)]);});

test('linkKeyParam reads the fragment and the fragment only',()=>{
 assert.equal(linkKeyParam('ws://h:1/?code=abcdefghijklmnopqrstuv#key='+'k'.repeat(43)),'k'.repeat(43));
 assert.equal(linkKeyParam('wss://relay.example:8443/somnia?code=abcdefghijklmnopqrstuv#key='+'A'.repeat(43)),'A'.repeat(43));
 assert.equal(linkKeyParam('ws://h:1/?code=abcdefghijklmnopqrstuv'),null);
 assert.equal(linkKeyParam('not a url'),null);
 assert.equal(linkKeyParam('ws://h:1/?code=abcdefghijklmnopqrstuv#other=1'),null);});

test('base64url helpers round trip',()=>{
 const raw=new Uint8Array([0,1,2,250,251,252,253,254,255]);
 assert.deepEqual([...fromBase64Url(toBase64Url(raw))],[...raw]);});
