/* Inlines examples/<name>/panel.html into the panel "html" field of examples/<name>/somnia-extension.json.
   The manifest format needs one JSON string, so the readable source lives in panel.html.
   Run from phase1: node scripts/build-example-panels.mjs   (add --check to fail when a manifest is out of date) */
import {readFileSync,writeFileSync,readdirSync,existsSync} from 'node:fs';
const root=new URL('../examples/',import.meta.url);const check=process.argv.includes('--check');let stale=0;
for(const name of readdirSync(root)){
 const html=new URL(`${name}/panel.html`,root),man=new URL(`${name}/somnia-extension.json`,root);
 if(!existsSync(html)||!existsSync(man))continue;
 const m=JSON.parse(readFileSync(man,'utf8'));const src=readFileSync(html,'utf8').trim();
 if(!m.contributes?.panels?.length)throw new Error(`${name}: manifest has no panel`);
 if(m.contributes.panels[0].html===src)continue;
 if(check){console.error(`${name}: manifest is out of date, run node scripts/build-example-panels.mjs`);stale++;continue;}
 m.contributes.panels[0].html=src;writeFileSync(man,JSON.stringify(m,null,2)+'\n');console.log(`updated ${name}`);
}
process.exit(stale?1:0);
