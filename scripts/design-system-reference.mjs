#!/usr/bin/env node
/** Bounded foundation reference extractor. No runtime app changes or CSS evaluation. */
import {readFileSync,writeFileSync,existsSync,readdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const dir=resolve(root,'docs/design/native-ui');
const text=readFileSync(resolve(root,'phase1/src/styles/tokens.css'),'utf8').replace(/\/\*[\s\S]*?\*\//g,'');
const blocks=[...text.matchAll(/([^{}]+)\{([^{}]+)\}/g)].map(([,selector,body])=>({selector:selector.trim(),values:Object.fromEntries([...body.matchAll(/(--[\w-]+)\s*:\s*([^;]+)(?:;|$)/g)].map(([,k,v])=>[k,v.trim()]))}));
if(!blocks.length)throw Error('No foundation token blocks extracted');
const modes=[['Dark',null,null],['Light','light',null],['Coffee Shop','light','cream'],['Forest Green','dark','green'],['Midnight Blue','dark','midnight'],['Blue Ice','light','blueice'],['Grape Red','dark','grape'],['Melon Pink','light','melon']];
const all=[...new Set(blocks.flatMap(b=>Object.keys(b.values)))];
const themes=modes.map(([label,mode,palette])=>({label,values:blocks.reduce((o,b)=>{
 const m=b.selector.match(/data-theme=(\w+)/)?.[1],p=b.selector.match(/data-palette=(\w+)/)?.[1];
 return (!m||m===mode)&&(!p||p===palette)?{...o,...b.values}:o;
},{})}));
let md='# Foundation palette reference\n\n[Overview](README.md) / [Token explanation](tokens.md)\n\nGenerated from `phase1/src/styles/tokens.css`. Values below resolve repeated foundation blocks in declaration order, before high contrast, feature styles and root inline preferences. Regenerate with `node scripts/design-system-reference.mjs --write`.\n\n';
for(const t of themes){md+=`## ${t.label}\n\n| Token | Foundation value |\n| --- | --- |\n`;for(const k of all)md+=`| \`${k}\` | \`${t.values[k]??'(unset)'}\` |\n`;md+='\n';}
const g=readFileSync(resolve(root,'phase1/src/styles/global.css'),'utf8');
md+='## High contrast overrides\n\nThese override only the listed roles. Inline user preferences can still win the CSS cascade.\n\n';
for(const [,selector,body] of g.matchAll(/(:root\[data-(?:theme=dark\]\[data-)?contrast=high\])\{([^{}]+)\}/g)){
 md+=`### ${selector.includes('theme=dark')?'Dark':'Light/default'}\n\n| Token | Value |\n| --- | --- |\n`;
 for(const [,k,v] of body.matchAll(/(--[\w-]+):([^;]+)(?:;|$)/g))md+=`| \`${k}\` | \`${v}\` |\n`;md+='\n';
}
const json=JSON.stringify({schema:'somnia.foundation-reference.v1',source:'phase1/src/styles/tokens.css',scope:'Foundation declarations only. Not runtime computed values or a DTCG production schema.',blocks},null,2)+'\n';
const expected=[['token-reference.json',json],['palette-reference.md',md.trimEnd()+'\n']];
let failures=[];
for(const [file,value] of expected){const path=resolve(dir,file);if(process.argv.includes('--write'))writeFileSync(path,value);else if(!existsSync(path)||readFileSync(path,'utf8')!==value)failures.push(`${file} is stale; regenerate with --write`);}
for(const file of readdirSync(dir).filter(f=>f.endsWith('.md'))){const s=readFileSync(resolve(dir,file),'utf8');for(const [,href] of s.matchAll(/\]\(([^)]+)\)/g)){if(/^(https?:|#|mailto:)/.test(href))continue;const path=href.split('#')[0];if(path&&!existsSync(resolve(dir,path)))failures.push(`${file}: missing link ${href}`);}}
if(failures.length){console.error(failures.join('\n'));process.exit(1);}
console.log(`${process.argv.includes('--write')?'Wrote':'Checked'} ${blocks.length} foundation blocks, ${all.length} token names, ${themes.length} palettes and guide file links.`);
