/** Theme exchange is inert data. No CSS injection, network, registry execution or app writes. */
export const THEME_ROLES=['background','foreground','card','card-foreground','popover','popover-foreground','primary','primary-foreground','secondary','secondary-foreground','muted','muted-foreground','accent','accent-foreground','destructive','destructive-foreground','border','input','ring','sidebar','sidebar-foreground','sidebar-primary','sidebar-primary-foreground','sidebar-accent','sidebar-accent-foreground','sidebar-border','sidebar-ring'] as const;
export type ThemeRole=typeof THEME_ROLES[number];
export type ThemeColors=Partial<Record<ThemeRole,string>>;
export interface ThemeExchange {version:1;name:string;light:ThemeColors;dark:ThemeColors;ignored:string[]}
export type ThemeResult={ok:true;theme:ThemeExchange}|{ok:false;error:string};
const roles=new Set<string>(THEME_ROLES);
const forbidden=new Set(['__proto__','prototype','constructor']);
const MAX_BYTES=65536,MAX_TOKENS=256;
/** Full literals only, no var/calc/url, channels-only HSL, arbitrary expressions or CSS suffix. */
export function isThemeColor(value:unknown):value is string {
 if(typeof value!=='string'||value.length>128)return false;
 if(/^#[\da-f]{3}(?:[\da-f]{1}|[\da-f]{3}|[\da-f]{5})?$/i.test(value))return true;
 const m=/^(rgb|rgba|hsl|hsla|oklch)\(([\d.+\-%,\s/]+)\)$/i.exec(value);if(!m)return false;
 const raw=m[2].trim(),numeric='[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)%?';
 const comma=new RegExp(`^${numeric}\\s*,\\s*${numeric}\\s*,\\s*${numeric}(?:\\s*,\\s*${numeric})?$`);
 const modern=new RegExp(`^${numeric}\\s+${numeric}\\s+${numeric}(?:\\s*/\\s*${numeric})?$`);
 if(!(raw.includes(',')?comma:modern).test(raw))return false;
 if(m[1].toLowerCase()==='oklch'&&raw.includes(','))return false;
 const parts=raw.split(/[\s,\/]+/);
 const numbers=parts.map(p=>Number(p.replace(/%$/,'')));if(numbers.some(n=>!Number.isFinite(n)))return false;
 const alpha=parts[3];if(alpha&&(numbers[3]<0||numbers[3]>(alpha.endsWith('%')?100:1)))return false;
 if(m[1].toLowerCase().startsWith('rgb'))return parts.slice(0,3).every((p,i)=>numbers[i]>=0&&numbers[i]<=(p.endsWith('%')?100:255));
 if(m[1].toLowerCase().startsWith('hsl'))return !parts[0].endsWith('%')&&parts[1].endsWith('%')&&parts[2].endsWith('%')&&numbers[1]>=0&&numbers[1]<=100&&numbers[2]>=0&&numbers[2]<=100;
 return numbers[0]>=0&&numbers[0]<=(parts[0].endsWith('%')?100:1)&&!parts[1].endsWith('%')&&numbers[1]>=0&&numbers[1]<=0.5&&!parts[2].endsWith('%');
}
/** Duplicate-aware bounded JSON reader. JSON.parse alone silently accepts duplicate keys. */
function readJson(input:string):unknown {
 let pos=0,tokens=0;const ws=()=>{while(/\s/.test(input[pos]??'')&&pos<input.length)pos++;};
 const string=()=>{const start=pos++;while(pos<input.length){if(input[pos]==='\\'){pos+=2;continue;}if(input[pos++]==='"')return JSON.parse(input.slice(start,pos));}throw Error('Unterminated string');};
 function value(depth=0):unknown {
  if(depth>12||++tokens>2048)throw Error('JSON complexity limit');ws();const c=input[pos];
  if(c==='"')return string();
  if(c==='{'){pos++;ws();const out=Object.create(null),seen=new Set<string>();if(input[pos]==='}'){pos++;return out;}while(true){ws();if(input[pos]!=='"')throw Error('Object key expected');const key=string();if(forbidden.has(key)||seen.has(key))throw Error('Forbidden or duplicate key');seen.add(key);ws();if(input[pos++]!==':')throw Error('Colon expected');out[key]=value(depth+1);ws();const end=input[pos++];if(end==='}')return out;if(end!==',')throw Error('Comma expected');}}
  if(c==='['){pos++;ws();const out:unknown[]=[];if(input[pos]===']'){pos++;return out;}while(true){out.push(value(depth+1));ws();const end=input[pos++];if(end===']')return out;if(end!==',')throw Error('Comma expected');}}
  const match=/^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(input.slice(pos));if(!match)throw Error('Invalid JSON value');pos+=match[0].length;return JSON.parse(match[0]);
 }
 const out=value();ws();if(pos!==input.length)throw Error('Trailing JSON');return out;
}
const object=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const safeName=(value:unknown)=>typeof value==='string'&&/^[\w .-]{1,80}$/.test(value)?value:'Imported theme';
function normalize(input:unknown):ThemeExchange {
 if(!object(input)||!object(input.cssVars))throw Error('Expected cssVars object');
 if(Object.keys(input.cssVars).some(key=>!['theme','light','dark'].includes(key)))throw Error('Unknown color scheme');
 if(input.type!==undefined&&!['registry:theme','registry:style'].includes(String(input.type)))throw Error('Unsupported registry type');
 const ignored:string[]=[],theme:ThemeExchange={version:1,name:safeName(input.name),light:{},dark:{},ignored};let count=0;
 for(const key of Object.keys(input))if(!['$schema','name','type','cssVars'].includes(key))ignored.push(key);
 for(const mode of ['theme','light','dark'].filter(key=>Object.hasOwn(input.cssVars as object,key))){
  if(!['light','dark','theme'].includes(mode))throw Error('Unknown color scheme');const source=input.cssVars[mode];if(!object(source))throw Error('Expected variable map');
  for(const [role,value] of Object.entries(source)){
   if(++count>MAX_TOKENS)throw Error('Token count limit');
   if(!roles.has(role)){
    if(/^(?:font-(?:sans|mono|serif)|radius|chart-[1-5]|shadow(?:-[\w-]+)?|tracking(?:-[\w-]+)?|spacing|letter-spacing)$/.test(role)){ignored.push(`cssVars.${mode}.${role}`);continue;}
    throw Error(`Unknown theme role: ${role}`);
   }
   if(!isThemeColor(value))throw Error(`Invalid color: ${role}`);
   if(mode==='theme'){for(const scheme of ['light','dark'] as const)if(theme[scheme][role as ThemeRole]===undefined)theme[scheme][role as ThemeRole]=value;}
   else theme[mode as 'light'|'dark'][role as ThemeRole]=value;
  }
 }
 if(!Object.keys(theme.light).length||!Object.keys(theme.dark).length)throw Error('Both schemes need colors');
 return theme;
}
export function parseThemeExchange(input:string,format:'json'|'css'='json'):ThemeResult {
 try {
  if(new TextEncoder().encode(input).length>MAX_BYTES)throw Error('Theme size limit');
  if(format==='json')return {ok:true,theme:normalize(readJson(input))};
  const text=input.replace(/\/\*[\s\S]*?\*\//g,'');let remaining=text;const cssVars:{light:Record<string,string>;dark:Record<string,string>}={light:{},dark:{}};const seen=new Set<string>();
  for(const match of text.matchAll(/(:root|\.dark)\s*\{([^{}]*)\}/g)){
   const mode=match[1]===':root'?'light':'dark';if(seen.has(mode))throw Error('Duplicate scheme block');seen.add(mode);remaining=remaining.replace(match[0],'');
   for(const declaration of match[2].split(';')){if(!declaration.trim())continue;const part=/^\s*--([\w-]+)\s*:\s*(.*?)\s*$/.exec(declaration);if(!part)throw Error('Only variable declarations allowed');if(forbidden.has(part[1])||Object.hasOwn(cssVars[mode],part[1]))throw Error('Forbidden or duplicate variable');cssVars[mode][part[1]]=part[2];}
  }
  if(remaining.trim())throw Error('Unsupported CSS selectors or at-rules');return {ok:true,theme:normalize({cssVars})};
 }catch(error){return {ok:false,error:error instanceof Error?error.message:'Invalid theme'};}
}
export const ROLE_ALIASES:Record<ThemeRole,string>={background:'--bg-base',foreground:'--text-primary',card:'--bg-panel','card-foreground':'--text-primary',popover:'--bg-elevated','popover-foreground':'--text-primary',primary:'--accent-fill','primary-foreground':'--action-ink',secondary:'--bg-surface','secondary-foreground':'--text-secondary',muted:'--bg-hover','muted-foreground':'--text-tertiary',accent:'--bg-hover','accent-foreground':'--text-primary',destructive:'--danger','destructive-foreground':'--status-danger-ink',border:'--border-default',input:'--border-subtle',ring:'--focus-ring',sidebar:'--bg-panel','sidebar-foreground':'--text-primary','sidebar-primary':'--accent-fill','sidebar-primary-foreground':'--action-ink','sidebar-accent':'--bg-hover','sidebar-accent-foreground':'--text-primary','sidebar-border':'--border-subtle','sidebar-ring':'--focus-ring'};
/** Namespaced output only. Never writes --accent, document colors, radius or native material. */
export function themeExchangeVariables(theme:ThemeExchange,mode:'light'|'dark'):Record<string,string>{const safe=normalize({name:theme.name,cssVars:{light:theme.light,dark:theme.dark}});return Object.fromEntries(THEME_ROLES.filter(role=>safe[mode][role]!==undefined).map(role=>[`--sc-${role}`,safe[mode][role]!]));}
export function exportThemeExchange(theme:ThemeExchange,format:'json'|'css'='json'):string {
 const ordered=(mode:'light'|'dark')=>Object.fromEntries(THEME_ROLES.filter(role=>theme[mode][role]!==undefined).map(role=>[role,theme[mode][role]]));
 // Revalidate caller-created objects, not only parsed ones.
 const normalized=normalize({name:theme.name,cssVars:{light:ordered('light'),dark:ordered('dark')}});
 if(format==='json')return JSON.stringify({name:normalized.name,type:'registry:theme',cssVars:{light:ordered('light'),dark:ordered('dark')}},null,2)+'\n';
 return ['light','dark'].map(mode=>`${mode==='light'?':root':'.dark'} {\n${THEME_ROLES.filter(role=>normalized[mode as 'light'|'dark'][role]!==undefined).map(role=>`  --${role}: ${normalized[mode as 'light'|'dark'][role]};`).join('\n')}\n}`).join('\n')+'\n';
}
