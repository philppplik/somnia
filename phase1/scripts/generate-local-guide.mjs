import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
export const guideSources={en:new URL('../../docs/ai/LOCAL-AI-IN-SOMNIA.md',import.meta.url),de:new URL('../../docs/ai/LOCAL-AI-IN-SOMNIA.de.md',import.meta.url)};
export function readLocalGuides(){return Object.fromEntries(Object.entries(guideSources).map(([locale,url])=>[locale,readFileSync(url,'utf8')]));}
export function generateLocalGuide(output=new URL('../src/lib/generated/localAIGuides.ts',import.meta.url)){
 const text='// Generated from docs/ai by scripts/generate-local-guide.mjs. Do not edit.\nexport default '+JSON.stringify(readLocalGuides(),null,2)+';\n';
 const path=fileURLToPath(output);mkdirSync(resolve(path,'..'),{recursive:true});let old='';try{old=readFileSync(path,'utf8');}catch{}if(old!==text)writeFileSync(path,text);return text;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))generateLocalGuide();
