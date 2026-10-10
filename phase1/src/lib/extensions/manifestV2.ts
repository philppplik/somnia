import Ajv2020 from 'ajv/dist/2020.js';
import {parse as parseToml} from 'smol-toml';
import {Range, satisfies, valid} from 'semver';
import parseSpdx from 'spdx-expression-parse';
import schema from './contracts/v2/manifest.schema.json';

export const MANIFEST_V2_FILENAME = 'somnia-extension.toml';
export const PACKAGE_V2_SUFFIX = '.somniax';
export const MAX_MANIFEST_BYTES = 256 * 1024;
export type ExtensionDiagnosticCode = `SOM-EXT-${string}`;
export interface ExtensionDiagnostic {code: ExtensionDiagnosticCode; path: string; message: string}
export type ValidationResult<T> = {ok:true; manifest:T} | {ok:false; errors:ExtensionDiagnostic[]};
export interface ContributionV2 {id:string; path?:string; icon?:string; when?:string; [key:string]:unknown}
export interface ManifestV2 {
  manifestVersion:2; id:string; publisher:string; name:string; version:string; description:string; license:string;
  engines:{somnia:string; api:string}; runtime:{type:'declarative'|'js'|'wasm'; entry?:string; abi?:string};
  activationEvents:string[]; permissions:string[];
  capabilities:{untrustedWorkspaces:{supported:'supported'|'unsupported'|'limited'; description?:string; allowedPermissions?:string[]}; virtualWorkspaces:{supported:boolean}};
  contributes:{commands?:ContributionV2[]; panels?:ContributionV2[]; themes?:ContributionV2[]; snippets?:ContributionV2[]};
  dependencies:{ecosystem:string; name:string; version:string; license:string; sourceIntegrity:string}[];
  proposedApis?:{id:string; revision:number}[]; icon?:string; repository?:string; homepage?:string; $schema?:string;
}
export interface ManifestValidationOptions {somniaVersion?:string; apiVersion?:string; lane?:'local'|'store'|'experimental'}
const validator = new Ajv2020({allErrors:true, strict:false}).compile(schema);
const pointer = (value:string) => value.replace(/~/g,'~0').replace(/\//g,'~1');
export const diagnostic = (code:ExtensionDiagnosticCode,path:string,message:string):ExtensionDiagnostic => ({code,path,message});

/** Same path policy on Windows, Unix and web. Never resolve an OS path from a manifest. */
export function isSafePackagePath(path:string):boolean {
  return path.length > 0 && path.length <= 180 && !/[\\:\u0000-\u001f\u007f]/.test(path) &&
    !path.startsWith('/') && path.split('/').every(p => p.length > 0 && p !== '.' && p !== '..' &&
      !/[ .]$/.test(p) && !['__proto__','constructor','prototype'].includes(p) && !/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p));
}
function safeTree(value:unknown,path:string,errors:ExtensionDiagnostic[],depth=0):void {
  if(depth > 32) {errors.push(diagnostic('SOM-EXT-002',path,'Manifest nesting exceeds 32 levels.')); return;}
  if(value && typeof value === 'object') for(const [key,child] of Object.entries(value)) {
    const p = `${path}/${pointer(key)}`;
    if(['__proto__','constructor','prototype'].includes(key)) errors.push(diagnostic('SOM-EXT-002',p,'Reserved property name.'));
    safeTree(child,p,errors,depth+1);
  }
}
/** Parses a closed, bounded context expression. No eval or JS expression parser. */
export function isValidWhen(source:string):boolean {
  if(source.length > 256) return false;
  const tokens:string[]=[]; let offset=0;
  const lex=/\s*(\&\&|\|\||==|!=|!|\(|\)|"(?:[^"\\]|\\["\\])*"|'(?:[^'\\]|\\['\\])*'|[A-Za-z][A-Za-z0-9]*)/y;
  while(offset < source.length) {if(!source.slice(offset).trim()) break; lex.lastIndex=offset; const m=lex.exec(source); if(!m) return false; tokens.push(m[1]); offset=lex.lastIndex;}
  let i=0; const keys=['studio','language','hasProject','hasSelection','workspaceTrusted','isReadonly'];
  const atom=(depth:number):boolean => {
    if(depth>8) return false;
    if(tokens[i]==='!') {i++; return atom(depth+1);}
    if(tokens[i]==='(') {i++; if(!or(depth+1)||tokens[i++]!==')') return false; return true;}
    const t=tokens[i++]; if(t==='true'||t==='false') return true;
    if(!keys.includes(t)) return false;
    if(tokens[i]==='=='||tokens[i]==='!=') {i++; const v=tokens[i++]; return !!v && (v==='true'||v==='false'||/^['"]/.test(v));}
    return true;
  };
  const and=(d:number):boolean => {if(!atom(d)) return false; while(tokens[i]==='&&') {i++; if(!atom(d)) return false;} return true;};
  const or=(d:number):boolean => {if(!and(d)) return false; while(tokens[i]==='||') {i++; if(!and(d)) return false;} return true;};
  return tokens.length>0 && or(0) && i===tokens.length;
}
function freezeTree<T>(value:T):T {
  if(value && typeof value === 'object') {for(const child of Object.values(value)) freezeTree(child); Object.freeze(value);}
  return value;
}
function boundedRange(text:string,api:boolean):boolean {
  try {
    // Only comparator sets are supported. Reject wildcard, URL, tag and implicit bounds.
    if(!/^(?:\s*(?:>=|>|<=|<|=)?\d+\.\d+\.\d+\s*)+$/.test(text)) return false;
    const range=new Range(text);
    return range.set.every(set => {
      const lower=set.filter(c=>c.operator==='>='||c.operator==='>');
      const upper=set.filter(c=>c.operator==='<');
      if(!lower.length||!upper.length) return false;
      const low=Math.max(...lower.map(c=>c.semver.major));
      const high=Math.min(...upper.map(c=>c.semver.major));
      if(!upper.every(c=>c.semver.minor===0&&c.semver.patch===0)) return false;
      if(high<=low || (api && (low!==2||high!==3))) return false;
      return low < high;
    });
  } catch {return false;}
}
function validLicense(value:string):boolean {
  if(value.startsWith('SEE LICENSE IN ')) return isSafePackagePath(value.slice(15));
  try {parseSpdx(value); return true;} catch {return false;}
}
const schemaKeys=new Set(['type','properties','required','additionalProperties','items','enum','const','minimum','maximum','minLength','maxLength','minItems','maxItems','description']);
function checkArgumentSchema(value:unknown,path:string,errors:ExtensionDiagnostic[],depth=0):void {
  if(!value||typeof value!=='object'||Array.isArray(value)||depth>8) {errors.push(diagnostic('SOM-EXT-003',path,'Invalid or excessively nested argument schema.')); return;}
  for(const [key,child] of Object.entries(value)) {
    const p=`${path}/${pointer(key)}`;
    if(!schemaKeys.has(key)) errors.push(diagnostic('SOM-EXT-003',p,'Unsupported argument schema keyword.'));
    else if(key==='properties' && child && typeof child==='object') for(const [name,s] of Object.entries(child)) checkArgumentSchema(s,`${p}/${pointer(name)}`,errors,depth+1);
    else if(key==='items'||(key==='additionalProperties'&&typeof child==='object')) checkArgumentSchema(child,p,errors,depth+1);
  }
  if(errors.some(e=>e.path.startsWith(path))) return;
  try {new Ajv2020({strict:false}).compile(value as object);} catch {errors.push(diagnostic('SOM-EXT-003',path,'Invalid argument schema.'));}
}
export function validateManifestV2(input:unknown,options:ManifestValidationOptions={}):ValidationResult<ManifestV2> {
  const errors:ExtensionDiagnostic[]=[]; safeTree(input,'',errors);
  if(errors.length) return {ok:false,errors};
  if(!validator(input)) {
    for(const e of validator.errors??[]) {
      const extra=e.keyword==='required'?e.params.missingProperty:e.keyword==='additionalProperties'?e.params.additionalProperty:undefined;
      errors.push(diagnostic('SOM-EXT-002',e.instancePath+(extra?`/${pointer(extra)}`:''),`Manifest ${e.message ?? 'is invalid'}.`));
    }
    return {ok:false,errors};
  }
  const m=input as unknown as ManifestV2;
  const fail=(path:string,message:string,code:ExtensionDiagnosticCode='SOM-EXT-003')=>errors.push(diagnostic(code,path,message));
  if(m.id.split('.')[0]!==m.publisher) fail('/publisher','Publisher must equal the extension ID namespace.');
  for(const kind of ['somnia','api'] as const) {
    if(!boundedRange(m.engines[kind],kind==='api')) fail(`/engines/${kind}`,'Engine range needs explicit lower and exclusive upper major bounds.','SOM-EXT-004');
    const host=kind==='somnia'?options.somniaVersion:options.apiVersion;
    if(host && (!valid(host)||!satisfies(host,m.engines[kind]))) fail(`/engines/${kind}`,'Host version does not satisfy the engine range.','SOM-EXT-004');
  }
  if(!validLicense(m.license)) fail('/license','License must be an SPDX expression or a safe SEE LICENSE IN path.');
  if(m.icon && !isSafePackagePath(m.icon)) fail('/icon','Unsafe package path.','SOM-EXT-005');
  if(m.runtime.entry && !isSafePackagePath(m.runtime.entry)) fail('/runtime/entry','Unsafe package path.','SOM-EXT-005');
  for(const key of ['homepage','repository'] as const) if(m[key]) {try {const u=new URL(m[key]); if(u.protocol!=='https:'||!u.hostname||u.username||u.password) throw 0;} catch {fail(`/${key}`,'Expected an HTTPS URL without credentials.');}}
  const startup=m.activationEvents.includes('*')||m.activationEvents.includes('onStartupFinished');
  for(const [family,entries] of Object.entries(m.contributes)) {
    const seen=new Set<string>();
    for(const [i,c] of (entries??[]).entries()) {
      const p=`/contributes/${family}/${i}`;
      if(seen.has(c.id)) fail(`${p}/id`,'Duplicate contribution ID.'); seen.add(c.id);
      if(family==='commands' && !c.id.startsWith(m.id+'.')) fail(`${p}/id`,'Command is outside the extension namespace.');
      for(const field of ['path','icon'] as const) if(c[field] && !isSafePackagePath(c[field]!)) fail(`${p}/${field}`,'Unsafe package path.','SOM-EXT-005');
      if(c.when && !isValidWhen(c.when)) fail(`${p}/when`,'Unsupported context expression.');
      for(const key of ['argumentsSchema','resultSchema']) if(c[key]) checkArgumentSchema(c[key],`${p}/${key}`,errors);
      if(family==='commands' && (!m.permissions.includes('commands')||m.runtime.type==='declarative')) fail(p,'Commands need the commands permission and executable runtime.');
      if(m.runtime.type!=='declarative' && ['commands','panels'].includes(family)) {
        const event=family==='commands'?`onCommand:${c.id}`:`onPanel:${m.id}.${c.id}`;
        if(!startup&&!m.activationEvents.includes(event)) fail(p,'Contribution has no matching activation event.');
      }
      if(m.runtime.type==='declarative'&&c.scripts===true) fail(`${p}/scripts`,'Declarative packages cannot execute panel scripts.');
    }
  }
  for(const [i,event] of m.activationEvents.entries()) {
    const p=`/activationEvents/${i}`;
    if(event.startsWith('onCommand:')&&!m.contributes.commands?.some(c=>`onCommand:${c.id}`===event)) fail(p,'Activation references an undeclared command.');
    if(event.startsWith('onPanel:')&&!m.contributes.panels?.some(c=>`onPanel:${m.id}.${c.id}`===event)) fail(p,'Activation references an undeclared panel.');
    if(event==='onSelectionChanged'&&!m.permissions.includes('selection')) fail(p,'Selection activation needs selection permission.');
    if(event.startsWith('workspaceContains:')) {
      const glob=event.slice(18);
      if(!m.permissions.includes('project.read')||glob.length>128||!isSafePackagePath(glob)||/[{}!()[\]]/.test(glob)) fail(p,'Workspace glob requires project.read and a safe bounded glob.');
    }
    if(options.lane==='store'&&event==='*') fail(p,'Eager activation is not allowed in the Store lane.');
  }
  const untrusted=m.capabilities.untrustedWorkspaces;
  if(untrusted.allowedPermissions?.some(p=>!m.permissions.includes(p))) fail('/capabilities/untrustedWorkspaces/allowedPermissions','Limited permissions must be a subset of declared permissions.');
  const deps=new Set<string>();
  for(const [i,d] of m.dependencies.entries()) {
    if(!validLicense(d.license)) fail(`/dependencies/${i}/license`,'Invalid dependency license.');
    if(d.ecosystem!=='other' && !valid(d.version)) fail(`/dependencies/${i}/version`,'Dependency version must be an exact SemVer.');
    const key=`${d.ecosystem}:${d.name}:${d.version}`; if(deps.has(key)) fail(`/dependencies/${i}`,'Duplicate dependency inventory record.'); deps.add(key);
  }
  if(m.proposedApis?.length && options.lane!=='experimental') fail('/proposedApis','Proposed APIs require the experimental lane.');
  return errors.length ? {ok:false,errors} : {ok:true,manifest:freezeTree(structuredClone(m))};
}
/** TOML keys retain the supplied v2 schema's camelCase names; no legacy table conversion. */
export function parseManifestV2(source:string|Uint8Array,options:ManifestValidationOptions={}):ValidationResult<ManifestV2> {
  try {
    const bytes=typeof source==='string'?new TextEncoder().encode(source):source;
    if(bytes.length>MAX_MANIFEST_BYTES) return {ok:false,errors:[diagnostic('SOM-EXT-001','','Manifest exceeds 256 KiB.')]};
    const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
    return validateManifestV2(parseToml(text),options);
  } catch {return {ok:false,errors:[diagnostic('SOM-EXT-001','','Manifest must be valid UTF-8 TOML with no duplicate keys.')]};}
}
