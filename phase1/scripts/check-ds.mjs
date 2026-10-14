/** P0 static ratchet. Uses the existing Babel parser, never executes app code. */
import {parse} from '@babel/parser';
function tree(text) { return parse(text,{sourceType:'module',plugins:['typescript','jsx']}); }
function walk(node, visit) { if(!node||typeof node!=='object')return; if(typeof node.type==='string')visit(node); for(const [key,value] of Object.entries(node))if(!['loc','start','end','extra','comments','tokens'].includes(key)){if(Array.isArray(value))for(const item of value)walk(item,visit);else if(value&&typeof value==='object')walk(value,visit);} }
import {readFileSync, writeFileSync, readdirSync, existsSync} from 'node:fs';
import {resolve, relative, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const metrics = ['rawButton', 'rawInput', 'rawSelect', 'rawTextarea', 'hexTsx', 'hexCss', 'pixelText', 'inlineStyle'];
export const exceptions = [
  ...['native-controls.tsx','number-field.tsx','range-field.tsx','panel.tsx'].map(name=>({path:`src/components/ui/${name}`,metrics:['rawButton','rawInput','rawSelect','rawTextarea'],reason:'Native backing elements of P1 primitives. Consumer areas remain fully ratcheted; hex, typography and inline debt are still counted.'})),
  {path:'src/lib/frameworks/templates/', metrics:'all', reason:'Generated user projects are authored content, not application chrome.'},
  {path:'src/themes/', metrics:['hexCss'], reason:'Syntax theme palettes are independent of application appearance.'},
  {path:'src/styles/tokens.css', metrics:['hexCss'], reason:'Canonical token definitions own literal colors.'},
  ...['vectorstudio/VectorCanvas.tsx','vectoredit/PenToolEditor.tsx','svgedit/GradientEditor.tsx'].map(name => ({path:`src/components/${name}`,metrics:['hexTsx'],reason:'Vector document colors and editing previews. Controls remain counted.'})),
];
function files(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name)).flatMap(e=>e.isDirectory()?files(resolve(dir,e.name)):[resolve(dir,e.name)]);
}
const isTest = p => /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(p) || /\/(?:__tests__|__fixtures__)\//.test(p);
export function countFile(text, path) {
  const out = Object.fromEntries(metrics.map(m=>[m,0]));
  if (path.endsWith('.tsx')) {
    walk(tree(text), node => {
      if(node.type==='JSXOpeningElement') {
        const tag=node.name.type==='JSXIdentifier'?node.name.name:'';
        const metric={button:'rawButton',input:'rawInput',select:'rawSelect',textarea:'rawTextarea'}[tag];
        if(metric)out[metric]++;
        for(const attr of node.attributes)if(attr.type==='JSXAttribute'&&attr.name.name==='style'&&attr.value?.expression?.type==='ObjectExpression')out.inlineStyle++;
      }
      if(['StringLiteral','JSXText','TemplateElement'].includes(node.type)) {
        const value=node.type==='TemplateElement'?node.value.raw:node.value;
        out.hexTsx+=(value.match(/#[\da-fA-F]{3,8}\b/g)||[]).length;
        out.pixelText+=(value.match(/\btext-\[\d+(?:\.\d+)?px\]/g)||[]).length;
      }
    });
  } else if(path.endsWith('.css')) out.hexCss=(text.replace(/\/\*[\s\S]*?\*\//g,'').match(/#[\da-fA-F]{3,8}\b/g)||[]).length;
  for(const ex of exceptions) if(path===ex.path||ex.path.endsWith('/')&&path.startsWith(ex.path))for(const m of ex.metrics==='all'?metrics:ex.metrics)out[m]=0;
  return out;
}
export function compareCounts(current, baseline) {
  return Object.entries(current).flatMap(([area,counts])=>metrics.filter(m=>counts[m]>(baseline[area]?.[m]??0)).map(m=>`${area}.${m}: ${baseline[area]?.[m]??0} -> ${counts[m]}`));
}
function measure(source) {
  const counts={};
  for(const [path,text] of source) {
    if(isTest(path)||!/(\.tsx|\.css)$/.test(path))continue;
    const parts=path.split('/'); const area=parts.length>3?parts.slice(0,3).join('/'):parts.slice(0,2).join('/');
    const values=countFile(text,path);
    counts[area]??=Object.fromEntries(metrics.map(m=>[m,0]));
    for(const m of metrics)counts[area][m]+=values[m];
  }
  return Object.fromEntries(Object.entries(counts).sort(([a],[b])=>a.localeCompare(b)));
}
export function extractHooks(text, path) {
  const hooks=[];
  walk(tree(text), node => {
    if(node.type==='CallExpression'&&node.callee.type==='MemberExpression') {
      const method=node.callee.property.name;const first=node.arguments[0];
      if(first?.type==='StringLiteral') {
        const value=first.value;
        if(['locator','$','$$','querySelector','querySelectorAll'].includes(method)) {
          for(const match of value.matchAll(/\.([a-zA-Z_][\w-]*)/g))hooks.push({kind:'class',value:match[1]});
          for(const match of value.matchAll(/\[([\w-]+)(?:[^\]]*)\]/g))hooks.push({kind:'attribute',value:match[1]});
        }
        if(['getAttribute','toHaveAttribute'].includes(method))hooks.push({kind:'attribute',value});
        if(method==='getPropertyValue'&&value.startsWith('--'))hooks.push({kind:'variable',value});
        if(method==='getByTestId')hooks.push({kind:'testId',value});
        if(method==='getByRole')hooks.push({kind:'role',value});
      }
    }
  });return hooks;
}

function inventory(source) {
  const entries=new Map();
  const add=(hook,path)=>{const key=`${hook.kind}:${hook.value}`; if(!entries.has(key))entries.set(key,{...hook,readers:[]});const entry=entries.get(key);if(!entry.readers.includes(path))entry.readers.push(path);};
  for(const file of files(resolve(root,'tests')).filter(p=>/\.[jt]sx?$/.test(p)))for(const hook of extractHooks(readFileSync(file,'utf8'),relative(root,file)))add(hook,relative(root,file));
  for(const value of ['--text-primary','--text-secondary','--accent','--border-subtle'])add({kind:'variable',value},'src/lib/extensions/panelHtml.ts (SDK)');
  const production=source.filter(([p])=>!isTest(p)&&!p.startsWith('src/lib/frameworks/templates/'));
  return {schemaVersion:1, note:'Static literal hooks only. Dynamic selectors/names need review. Unresolved external/browser/fixture hooks are recorded, not claimed protected.',hooks:[...entries.values()].sort((a,b)=>`${a.kind}:${a.value}`.localeCompare(`${b.kind}:${b.value}`)).map(h=>({...h,owners:production.filter(([,text])=>hasHook(text,h)).map(([path])=>path)}))};
}
export function hasHook(text, hook) {
  const escaped=hook.value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  return new RegExp(`(?<![\\w-])${escaped}(?![\\w-])`).test(text);
}
export function missingHooks(current, previous) {
  const live=new Map(current.hooks.map(h=>[`${h.kind}:${h.value}`,h]));
  return previous.hooks.filter(h=>{
    if(!h.owners.length)return false;
    const next=live.get(`${h.kind}:${h.value}`);
    if(!next?.owners.length)return true;
    // A class remaining in CSS cannot conceal its removal from rendered JSX.
    if(['class','attribute','testId'].includes(h.kind)&&h.owners.some(p=>p.endsWith('.tsx')))return !next.owners.some(p=>p.endsWith('.tsx'));
    return false;
  }).map(h=>`${h.kind}:${h.value}`);
}
function main() {
  const source=files(resolve(root,'src')).filter(p=>/\.(?:[jt]sx?|css)$/.test(p)).map(p=>[relative(root,p).replaceAll('\\','/'),readFileSync(p,'utf8')]);
  const baselinePath=resolve(root,'scripts/ds-baseline.json');const hooksPath=resolve(root,'scripts/ds-hooks.json');
  const counts=measure(source); const hooks=inventory(source);
  const init=process.argv.includes('--init'); const update=process.argv.includes('--update');
  if(init&&(existsSync(baselinePath)||existsSync(hooksPath)))throw Error('Refusing to reinitialize an existing ratchet. Use --update; it accepts reductions only.');
  if(!init) {
    const previous=JSON.parse(readFileSync(baselinePath,'utf8')); const priorHooks=JSON.parse(readFileSync(hooksPath,'utf8'));
    if(JSON.stringify(previous.exceptions)!==JSON.stringify(exceptions))throw Error('Exception policy changed. Review and explicitly update both script and baseline; --update cannot silently expand exemptions.');
    const failures=[...compareCounts(counts,previous.counts),...missingHooks(hooks,priorHooks).map(h=>`Public hook removed: ${h}`)];
    if(failures.length){console.error(failures.join('\n'));process.exitCode=1;return;}
  }
  if(init||update){writeFileSync(baselinePath,JSON.stringify({schemaVersion:1,exceptions,counts},null,2)+'\n');writeFileSync(hooksPath,JSON.stringify(hooks,null,2)+'\n');}
  console.log(`Design-system ratchet passed: ${Object.keys(counts).length} areas, ${hooks.hooks.length} literal hooks (${hooks.hooks.filter(h=>h.owners.length).length} source-backed).`);
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main();
