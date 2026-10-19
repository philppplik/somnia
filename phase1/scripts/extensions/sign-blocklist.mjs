#!/usr/bin/env node
/** Signs the extension blocklist feed with Ed25519 over the exact UTF-8 file bytes.
 *
 * Maintainer use only (see docs/extensions-store.md, "Blocklist"):
 *
 *   node scripts/extensions/sign-blocklist.mjs --generate   # one-time key pair
 *   SOMNIA_BLOCKLIST_PRIVATE_KEY='<private JWK from --generate>' node scripts/extensions/sign-blocklist.mjs
 *
 * --generate prints a fresh key pair: the PUBLIC key is bundled into the app
 * (src/lib/extensions/blocklistWiring.ts, BLOCKLIST_CONFIG.publicKeyBase64),
 * the PRIVATE key goes into the GitHub environment secret SOMNIA_BLOCKLIST_PRIVATE_KEY
 * (environment with a required reviewer). The private key is never committed.
 *
 * Signing reads docs/extensions/catalog/blocklist.json and writes
 * docs/extensions/catalog/blocklist.sig (base64, single line). Commit both together;
 * the app fetches them from the catalog raw URLs and rejects rollback and tampering. */
import {generateKeyPairSync,sign as edSign,createPrivateKey} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';

const here=dirname(fileURLToPath(import.meta.url));
const catalogDir=join(here,'..','..','docs','extensions','catalog');
const feedPath=join(catalogDir,'blocklist.json');
const sigPath=join(catalogDir,'blocklist.sig');

const b64uToB64=s=>s.replace(/-/g,'+').replace(/_/g,'/');

if(process.argv.includes('--generate')){
 const {publicKey,privateKey}=generateKeyPairSync('ed25519');
 const pub=publicKey.export({format:'jwk'});const priv=privateKey.export({format:'jwk'});
 console.log('Somnia extension blocklist signing key (Ed25519)');
 console.log('');
 console.log(`PUBLIC key  (bundle into BLOCKLIST_CONFIG.publicKeyBase64): ${b64uToB64(pub.x)}`);
 console.log(`PRIVATE key (GitHub secret SOMNIA_BLOCKLIST_PRIVATE_KEY, never commit): ${JSON.stringify(priv)}`);
 process.exit(0);
}

const seed=process.env.SOMNIA_BLOCKLIST_PRIVATE_KEY;
if(!seed){console.error('Missing SOMNIA_BLOCKLIST_PRIVATE_KEY (base64url Ed25519 seed).');process.exit(1);}
let key;
try{const jwk=JSON.parse(seed);key=createPrivateKey({key:jwk,format:'jwk'});}catch{console.error('SOMNIA_BLOCKLIST_PRIVATE_KEY is not a valid Ed25519 private JWK.');process.exit(1);}

const payload=readFileSync(feedPath,'utf8');
// Same shape rules as the app consumer (blocklist.ts), kept intentionally simple here:
// the app is the strict validator and rejects a malformed feed.
let feed;
try{feed=JSON.parse(payload);}catch{console.error('blocklist.json is not valid JSON.');process.exit(1);}
if(!Number.isSafeInteger(feed.revision)||feed.revision<0||!Array.isArray(feed.blocked)){console.error('blocklist.json needs {revision: int >= 0, blocked: []}.');process.exit(1);}
for(const b of feed.blocked){
 if(!b||typeof b.id!=='string'||typeof b.versions!=='string'||typeof b.reason_url!=='string'||!b.reason_url.startsWith('https://')){console.error(`Invalid blocklist entry: ${JSON.stringify(b)}`);process.exit(1);}
}

const signature=edSign(null,Buffer.from(payload,'utf8'),key);
writeFileSync(sigPath,signature.toString('base64')+'\n');
console.log(`Signed revision ${feed.revision} (${feed.blocked.length} entries) -> ${sigPath}`);
console.log('Commit blocklist.json and blocklist.sig together.');
