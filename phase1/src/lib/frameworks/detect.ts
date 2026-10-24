export type DetectedFramework='react'|'vue'|'svelte'|'solid'|'astro'|'next'|'sveltekit'|'nuxt';
export interface FrameworkDetection{framework:DetectedFramework;language:'ts'|'js';managed:boolean;entry:string;output:'static'|'node'}
/** Reads data only. A detection is never permission to install packages or execute project scripts. */
export function detectFramework(files:Readonly<Record<string,string>>):FrameworkDetection|null{
 try{
  const raw=files['package.json'];if(!raw||raw.length>256*1024)return null;const pkg=JSON.parse(raw);
  const deps={...pkg.dependencies,...pkg.devDependencies};const has=(name:string)=>typeof deps[name]==='string';
  const framework:DetectedFramework|null=has('next')?'next':has('astro')?'astro':has('@sveltejs/kit')?'sveltekit':has('nuxt')?'nuxt':has('react')?'react':has('vue')?'vue':has('svelte')?'svelte':has('solid-js')?'solid':null;
  if(!framework)return null;
  const language=Object.keys(files).some(f=>/\.(ts|tsx)$/.test(f))?'ts':'js';let manifest:Record<string,unknown>={};
  try{manifest=JSON.parse(files['somnia.template.json']??'{}');}catch{/* unknown projects are inert */}
  const managed=manifest.framework===framework&&typeof manifest.id==='string';
  const entry=Object.keys(files).find(f=>/^src\/App\.([jt]sx|vue|svelte)$/.test(f))??Object.keys(files).find(f=>/^src\/(main|index)\.[jt]sx?$/.test(f))??'package.json';
  return {framework,language,managed,entry,output:manifest.output==='node'?'node':manifest.output==='static'?'static':outputFor(framework,deps,files)};
 }catch{return null;}
}
/** Mirror of the native rules: Next and Nuxt build a server unless told otherwise, Astro and SvelteKit need their Node adapter. */
function outputFor(framework:DetectedFramework,deps:Record<string,unknown>,files:Readonly<Record<string,string>>):'static'|'node'{
 const has=(n:string)=>typeof deps[n]==='string';
 if(framework==='astro')return has('@astrojs/node')?'node':'static';
 if(framework==='sveltekit')return has('@sveltejs/adapter-static')&&!has('@sveltejs/adapter-node')?'static':'node';
 if(framework==='next'){const cfg=Object.entries(files).find(([p])=>/^next\.config\.(m?js|ts)$/.test(p))?.[1]??'';return /output\s*:\s*['"]export['"]/.test(cfg)?'static':'node';}
 return framework==='nuxt'?'node':'static';
}
export function isFrameworkSource(path:string){return /\.(html?|css|[cm]?js|jsx|ts|tsx|json|svg|txt|md|vue|svelte|astro)$/i.test(path)&&!path.split('/').some(p=>['node_modules','.git','dist','.next','.output'].includes(p));}
/** Display name for banners and labels. Unknown ids fall back to the id itself. */
export const frameworkLabel=(framework:string)=>({react:'React',vue:'Vue',svelte:'Svelte',solid:'Solid',astro:'Astro',next:'Next.js',sveltekit:'SvelteKit',nuxt:'Nuxt'} as Record<string,string>)[framework]??framework;
