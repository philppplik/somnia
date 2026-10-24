export type FrameworkLanguage='ts'|'js';
/** Vite based single page frameworks with a bundled template. */
export const TEMPLATE_FRAMEWORKS=['react','vue','svelte','solid'] as const;
export type TemplateFramework=typeof TEMPLATE_FRAMEWORKS[number];
export const FRAMEWORK_LABELS:Readonly<Record<TemplateFramework,string>>={react:'React',vue:'Vue',svelte:'Svelte',solid:'Solid'};
export interface TemplateManifest {id:string;framework:TemplateFramework;language:FrameworkLanguage;output:'static';scripts:{dev:'dev';build:'build'};artifactPath:'dist'}
export interface FrameworkTemplate {manifest:TemplateManifest;files:Readonly<Record<string,string>>}
export function validateTemplateManifest(value:unknown):TemplateManifest{
 if(!value||typeof value!=='object')throw Error('Invalid template');const v=value as Record<string,unknown>;const scripts=v.scripts as Record<string,unknown>|undefined;
 const framework=v.framework as TemplateFramework;
 if(!TEMPLATE_FRAMEWORKS.includes(framework)||!['ts','js'].includes(String(v.language))||v.id!==`${framework}-${v.language}`||v.output!=='static'||v.artifactPath!=='dist'||scripts?.dev!=='dev'||scripts?.build!=='build')throw Error('Invalid template');
 return {id:String(v.id),framework,language:v.language as FrameworkLanguage,output:'static',scripts:{dev:'dev',build:'build'},artifactPath:'dist'};
}
/** File the editor opens first. React and Solid share the JSX naming, Vue and Svelte use single file components. */
export function templateEntryFile(framework:TemplateFramework,language:FrameworkLanguage):string{
 return framework==='vue'?'src/App.vue':framework==='svelte'?'src/App.svelte':`src/App.${language}x`;
}

/** Server rendered frameworks. Their builds produce a Node bundle (kind=node) instead of static files. */
export const SERVER_TEMPLATE_FRAMEWORKS=['next','astro','sveltekit','nuxt'] as const;
export type ServerTemplateFramework=typeof SERVER_TEMPLATE_FRAMEWORKS[number];
export const SERVER_FRAMEWORK_LABELS:Readonly<Record<ServerTemplateFramework,string>>={next:'Next.js',astro:'Astro',sveltekit:'SvelteKit',nuxt:'Nuxt'};
export const SERVER_ARTIFACT_PATHS:Readonly<Record<ServerTemplateFramework,string>>={next:'.next/standalone',astro:'dist',sveltekit:'build',nuxt:'.output'};
export type AnyTemplateFramework=TemplateFramework|ServerTemplateFramework;
export const ALL_TEMPLATE_FRAMEWORKS:readonly AnyTemplateFramework[]=[...TEMPLATE_FRAMEWORKS,...SERVER_TEMPLATE_FRAMEWORKS];
export const isServerFramework=(f:string):f is ServerTemplateFramework=>(SERVER_TEMPLATE_FRAMEWORKS as readonly string[]).includes(f);
export interface ServerTemplateManifest {id:string;framework:ServerTemplateFramework;language:FrameworkLanguage;output:'node';scripts:{dev:'dev';build:'build'};artifactPath:string}
export interface ServerFrameworkTemplate {manifest:ServerTemplateManifest;files:Readonly<Record<string,string>>}
export function validateServerTemplateManifest(value:unknown):ServerTemplateManifest{
 if(!value||typeof value!=='object')throw Error('Invalid template');const v=value as Record<string,unknown>;const scripts=v.scripts as Record<string,unknown>|undefined;
 const framework=v.framework as ServerTemplateFramework;
 if(!isServerFramework(String(framework))||!['ts','js'].includes(String(v.language))||v.id!==`${framework}-${v.language}`||v.output!=='node'||v.artifactPath!==SERVER_ARTIFACT_PATHS[framework]||scripts?.dev!=='dev'||scripts?.build!=='build')throw Error('Invalid template');
 return {id:String(v.id),framework,language:v.language as FrameworkLanguage,output:'node',scripts:{dev:'dev',build:'build'},artifactPath:SERVER_ARTIFACT_PATHS[framework]};
}
/** First file the editor opens for a server template. */
export function serverTemplateEntryFile(framework:ServerTemplateFramework,language:FrameworkLanguage):string{
 return framework==='next'?`app/page.${language}x`:framework==='astro'?'src/pages/index.astro':framework==='sveltekit'?'src/routes/+page.svelte':'app/app.vue';
}
