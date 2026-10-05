import {zipSync} from 'fflate';
import {parsePackageFiles} from './packageInstall';
import {validateCatalog,type CatalogEntry} from './catalog';
import type {ExtensionManifest} from './types';
/** Authoring kit core: pure functions shared by the CLI (scripts/somnia-ext.ts) and the tests. No file system or crypto here. */
export interface LintResult{ok:boolean;errors:string[];warnings:string[];manifest?:ExtensionManifest;catalogReady:boolean}
const MANIFEST=/(^|\/)(somnia-extension|manifest)\.json$/;
/** Runs the same parser the app uses on install, then adds author-facing warnings. */
export function lintPackage(files:Record<string,Uint8Array>):LintResult{
 const r=parsePackageFiles(files);
 if(!r.ok)return{ok:false,errors:r.errors,warnings:[],catalogReady:false};
 const warnings:string[]=[];const names=Object.keys(files);
 const m=r.manifest;
 const raw=JSON.parse(new TextDecoder().decode(files[names.find(n=>MANIFEST.test(n))!]));
 if(!names.some(n=>/(^|\/)README(\.md)?$/i.test(n)))warnings.push('No README.md. Explain what the extension does and why each permission is needed.');
 if(!names.some(n=>/(^|\/)LICENSE(\.md|\.txt)?$/i.test(n)))warnings.push('No LICENSE file. The index review needs a clear license.');
 const hasCode=typeof m.code==='string';
 if(hasCode)warnings.push('Contains worker code. The GitHub index currently refuses worker code; this package can only be installed locally.');
 if(!hasCode&&typeof raw.main==='string')warnings.push('Uses "main". It is inlined into code at install time (see above).');
 if(m.permissions.length===0&&!m.contributes.commands.length&&!m.contributes.snippets.length&&!m.contributes.codeThemes.length&&!m.contributes.panels.length&&!hasCode)warnings.push('The extension contributes nothing.');
 if(m.permissions.includes('project.write'))warnings.push('Requests project.write. Reviewers will check that every write is necessary.');
 for(const p of m.contributes.panels){if(/https?:\/\//i.test(p.html))warnings.push(`Panel "${p.id}" mentions an http(s) URL. Panels cannot load network resources (CSP).`);}
 return{ok:true,errors:[],warnings,manifest:m,catalogReady:!hasCode};
}
/** Deterministic ZIP: sorted names, fixed timestamp, so the same sources always give the same SHA-256. Skips dotfiles, node_modules and OS junk. */
export function buildZip(files:Record<string,Uint8Array>):Uint8Array{
 const out:Record<string,Uint8Array>={};
 for(const n of Object.keys(files).sort()){if(n.split('/').some(p=>p.startsWith('.')||p==='node_modules')||n.endsWith('.zip'))continue;out[n]=files[n];}
 return zipSync(out,{mtime:new Date('2026-01-01T00:00:00Z'),level:9});
}
export interface EntryInput{author:string;description:string;repo:string;download:string;sha256:string}
/** Builds an index entry for a manifest and validates it with the real index validator. */
export function makeIndexEntry(manifest:ExtensionManifest,input:EntryInput):CatalogEntry{
 const entry={id:manifest.id,name:manifest.name,version:manifest.version,author:input.author,description:input.description,repo:input.repo,download:input.download,sha256:input.sha256,apiVersion:manifest.apiVersion,permissions:manifest.permissions};
 return validateCatalog({schemaVersion:1,extensions:[entry]})[0];
}
/** Raw URL the index needs for a ZIP committed to a GitHub repo at a tag or commit. */
export function rawZipURL(repo:string,ref:string,path:string):string{
 const m=/^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+?)\/?$/.exec(repo);if(!m)throw new Error('repo must look like https://github.com/owner/name');
 return `https://raw.githubusercontent.com/${m[1]}/${m[2]}/${ref}/${path.replace(/^\/+/,'')}`;
}
/** Fills the template placeholders. */
export function fillTemplate(text:string,vars:{id:string;name:string}):string{return text.split('__ID__').join(vars.id).split('__NAME__').join(vars.name);}
