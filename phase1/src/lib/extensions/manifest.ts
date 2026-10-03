import {API_VERSION,PERMISSIONS,type ExtensionManifest,type ManifestResult,type Permission} from './types';
const ID=/^[a-z0-9][a-z0-9-]*(\.[a-z0-9][a-z0-9-]*)+$/;
const SEMVER=/^\d+\.\d+\.\d+$/;
const CATEGORIES=['Project','Edit','View','Insert','Tools','Help'];
const SYNTAX_TOKENS=['--syntax-tag','--syntax-keyword','--syntax-string','--syntax-number'];
const COLOR=/^#[0-9a-f]{3,8}$/i;
const obj=(v:unknown):v is Record<string,unknown>=>typeof v==='object'&&v!==null&&!Array.isArray(v);
/** Validates an untrusted manifest. Unknown permissions, an unsupported apiVersion, ids outside the extension namespace and non-color theme values are rejected. */
export function validateManifest(input:unknown):ManifestResult{
 const errors:string[]=[];if(!obj(input))return{ok:false,errors:['Manifest must be a JSON object.']};
 const str=(k:string,max=80)=>{const v=input[k];if(typeof v!=='string'||!v.trim()||v.length>max){errors.push(`"${k}" must be a non-empty string up to ${max} characters.`);return'';}return v;};
 const id=str('id',100);if(id&&!ID.test(id))errors.push('"id" must look like vendor.name (lowercase letters, digits, dashes).');
 const name=str('name'),version=str('version',20);if(version&&!SEMVER.test(version))errors.push('"version" must be x.y.z.');
 if(input.apiVersion!==API_VERSION)errors.push(`"apiVersion" must be ${API_VERSION}; this host does not support ${String(input.apiVersion)}.`);
 const main=input.main===undefined?undefined:str('main',120);if(main&&(main.startsWith('/')||main.includes('..')||main.includes('\\')))errors.push('"main" must be a relative path inside the extension.');
 const permissions:Permission[]=[];if(!Array.isArray(input.permissions))errors.push('"permissions" must be an array.');else for(const p of input.permissions){if(typeof p==='string'&&(PERMISSIONS as readonly string[]).includes(p)){if(!permissions.includes(p as Permission))permissions.push(p as Permission);}else errors.push(`Unknown permission: ${String(p)}.`);}
 const c=obj(input.contributes)?input.contributes:{};if(input.contributes!==undefined&&!obj(input.contributes))errors.push('"contributes" must be an object.');
 const list=(k:string)=>{const v=c[k];if(v===undefined)return[];if(!Array.isArray(v)||v.length>200){errors.push(`contributes.${k} must be an array of at most 200 items.`);return[];}return v;};
 const commands=list('commands').flatMap((x,i)=>{if(!obj(x)||typeof x.id!=='string'||typeof x.title!=='string'||typeof x.category!=='string'||!CATEGORIES.includes(x.category)||!x.title.trim()||x.title.length>80){errors.push(`contributes.commands[${i}] needs id, title and a known category.`);return[];}
  if(id&&!x.id.startsWith(id+'.')){errors.push(`Command id ${x.id} must start with "${id}.".`);return[];}return[{id:x.id,title:x.title,category:x.category as ExtensionManifest['contributes']['commands'][number]['category']}];});
 const snippets=list('snippets').flatMap((x,i)=>{if(!obj(x)||!['html','css','js'].includes(String(x.language))||typeof x.label!=='string'||typeof x.body!=='string'||!x.label.trim()||x.body.length>8000){errors.push(`contributes.snippets[${i}] needs language html|css|js, a label and a body up to 8000 characters.`);return[];}return[{language:x.language as 'html'|'css'|'js',label:x.label,body:x.body}];});
 const codeThemes=list('codeThemes').flatMap((x,i)=>{if(!obj(x)||typeof x.id!=='string'||!/^[a-z0-9-]+$/.test(x.id)||typeof x.label!=='string'||!obj(x.light)||!obj(x.dark)){errors.push(`contributes.codeThemes[${i}] needs id (lowercase, dashes), label, light and dark.`);return[];}
  const side=(o:Record<string,unknown>)=>{const out:Record<string,string>={};for(const [k,v] of Object.entries(o)){if(!SYNTAX_TOKENS.includes(k)||typeof v!=='string'||!COLOR.test(v)){errors.push(`codeThemes[${i}]: ${k} must be one of ${SYNTAX_TOKENS.join(', ')} with a hex color.`);continue;}out[k]=v;}return out;};
  return[{id:x.id,label:x.label,light:side(x.light),dark:side(x.dark)}];});
 if((commands.length)&&!permissions.includes('commands'))errors.push('Commands need the "commands" permission.');
 if(errors.length)return{ok:false,errors};
 return{ok:true,manifest:{id,name,version,apiVersion:API_VERSION,...(main?{main}:{}),permissions,contributes:{commands,snippets,codeThemes}}};
}
