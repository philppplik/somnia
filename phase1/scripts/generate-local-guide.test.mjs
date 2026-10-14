import test from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync,readFileSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';import {pathToFileURL} from 'node:url';import {generateLocalGuide,readLocalGuides} from './generate-local-guide.mjs';
const pairs=[
['# Local AI in Somnia','# Lokale KI in Somnia'],
['## Set up Ollama','## Ollama einrichten'],
['## Choose and manage models','## Modelle auswählen und verwalten'],
['### Context and model defaults','### Kontext und Modellvorgaben'],
['### Other runtimes','### Andere Laufzeiten'],
['## Offline mode and cloud routing','## Offline-Modus und Cloud-Routing'],
['## Control what a local request receives','## Steuern, was eine lokale Anfrage erhält'],
['## Images, tools and suggestions','## Bilder, Tools und Vorschläge'],
['## Compare and evaluate models','## Modelle vergleichen und bewerten'],
['## What stays on this device','## Was auf diesem Gerät bleibt'],
['## Voice: experimental, unavailable by default','## Sprache: experimentell, standardmäßig nicht verfügbar'],
['## Troubleshooting','## Fehlerbehebung']];
test('English/German complete heading order and depth stay aligned; new/removed/renamed headings require translation review',()=>{const guides=readLocalGuides();for(const [index,locale]of ['en','de'].entries())assert.deepEqual(guides[locale].match(/^#{1,6} .+$/gm),pairs.map(pair=>pair[index]));});
test('generation reads both current sources, deterministic output equals their exact bytes and regenerates without a checked-in copy',()=>{const dir=mkdtempSync(join(tmpdir(),'local-guide-'));try{const url=pathToFileURL(join(dir,'generated.ts'));const first=generateLocalGuide(url);assert.equal(first,generateLocalGuide(url));assert.equal(readFileSync(url,'utf8'),first);const payload=JSON.parse(first.slice(first.indexOf('export default ')+15).trim().slice(0,-1));assert.deepEqual(payload,readLocalGuides());}finally{rmSync(dir,{recursive:true,force:true});}});
