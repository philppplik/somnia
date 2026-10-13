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
