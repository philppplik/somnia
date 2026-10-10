import {stringify} from 'smol-toml';
import {validateManifestV2,MANIFEST_V2_FILENAME,type ManifestV2} from '../manifestV2';
import type {ExtensionManifest} from '../types';
import {ExtensionError} from '../contracts/v2/api';
export interface MigrationOptions {somniaRange:string;apiRange:string;license:string;description:string}
export interface MigrationResult {manifest:ManifestV2;files:Readonly<Record<string,string>>;warnings:string[]}
/** Produces NEW files for developer review. Never overwrites installs or infers tested engine ranges/consent. */
export function migrateLegacy(manifest:ExtensionManifest,options:MigrationOptions):MigrationResult {
 const files:Record<string,string>=Object.create(null);const warnings=['Review generated code against the v2 typed API, renew permissions and test before enablement.'];
 const executable=!!manifest.code||manifest.contributes.commands.length>0;
 if(manifest.main&&!manifest.code)throw new ExtensionError('E_INVALID_ARGUMENT','Legacy main entries need manual migration.');
 const snippets=manifest.contributes.snippets.map((s,i)=>{const path=`snippets/snippet-${i}.json`;
  // CodeMirror expands $n placeholders. Escape literal dollars from the v1 literal snippet lane.
  files[path]=JSON.stringify({body:s.body.replace(/\$/g,'\\$')},null,2);return {id:`snippet-${i}`,label:s.label,language:s.language,path};});
 const themes=manifest.contributes.codeThemes.flatMap(t=>['light','dark'].map(mode=>{const path=`themes/${t.id}-${mode}.json`;files[path]=JSON.stringify(t[mode as 'light'|'dark'],null,2);return {id:`${t.id}-${mode}`,label:`${t.label} (${mode})`,kind:'code',mode,path};}));
 const panels=manifest.contributes.panels.map(p=>{const path=`panels/${p.id}.html`;files[path]=p.html;return {id:p.id,title:p.title,side:p.side,kind:'webview',path,scripts:false};});
 if(panels.length)warnings.push('Legacy panels are script-free until manually migrated to the owned host message bridge.');
 if(manifest.code){files['extension.js']=`// Migrated from ${manifest.id} ${manifest.version}; developer review required.\nexport async function activate(context) {\n  const somnia = context.somnia;\n${manifest.code}\n}\n`;
  warnings.push('v1 readFile returns a string; v2 returns {text, revision}. Writes require baseRevisions. Await command registration.');}
 const m={manifestVersion:2,id:manifest.id,publisher:manifest.id.split('.')[0],name:manifest.name,version:manifest.version,description:options.description,license:options.license,
  engines:{somnia:options.somniaRange,api:options.apiRange},runtime:executable?{type:'js',entry:'extension.js'}:{type:'declarative'},
  activationEvents:executable?[...manifest.contributes.commands.map(c=>`onCommand:${c.id}`),...panels.map(p=>`onPanel:${manifest.id}.${p.id}`)]:[],
  permissions:[...manifest.permissions],capabilities:{untrustedWorkspaces:{supported:'unsupported'},virtualWorkspaces:{supported:false}},
  contributes:{commands:manifest.contributes.commands.map(c=>({...c})),snippets,themes,panels},dependencies:[]} as ManifestV2;
 if(executable&&!manifest.code)throw new ExtensionError('E_HANDLER_MISSING','Legacy commands have no inline code to migrate.');
 const validated=validateManifestV2(m);if(!validated.ok)throw new ExtensionError('E_INVALID_ARGUMENT','Legacy package needs manual manifest migration.');
 files[MANIFEST_V2_FILENAME]=stringify(m as unknown as Record<string,unknown>);
 files['MIGRATION.md']=`# Legacy migration\n\nSource: ${manifest.id} ${manifest.version} (API 1).\nTarget: somnia-extension.toml, .somniax (API 2).\n\n${warnings.map(w=>`- ${w}`).join('\n')}\n\nDependency inventory is empty only if the legacy code has no third-party dependencies. Generate the full inventory before packaging.\n`;
 return {manifest:validated.manifest,files:Object.freeze(files),warnings};
}
