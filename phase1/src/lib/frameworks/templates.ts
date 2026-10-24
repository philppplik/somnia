import {validateTemplateManifest,validateServerTemplateManifest,templateEntryFile,TEMPLATE_FRAMEWORKS,SERVER_TEMPLATE_FRAMEWORKS,type FrameworkLanguage,type FrameworkTemplate,type ServerFrameworkTemplate,type ServerTemplateFramework,type TemplateFramework} from './templateManifest';
export type {FrameworkLanguage,FrameworkTemplate,TemplateFramework} from './templateManifest';
export {templateEntryFile,TEMPLATE_FRAMEWORKS,FRAMEWORK_LABELS,SERVER_TEMPLATE_FRAMEWORKS,SERVER_FRAMEWORK_LABELS,serverTemplateEntryFile,isServerFramework,ALL_TEMPLATE_FRAMEWORKS} from './templateManifest';
export type {ServerFrameworkTemplate,ServerTemplateFramework} from './templateManifest';

/** Importing this public module is safe in Node. Only an explicit scaffold request loads Vite assets. */
export async function frameworkTemplate(framework:TemplateFramework,language:FrameworkLanguage):Promise<FrameworkTemplate>{
 const {templateFiles}=await import('./templateBundle.vite');
 return frameworkTemplateFromFiles(framework,language,templateFiles);
}
export const reactTemplate=(language:FrameworkLanguage)=>frameworkTemplate('react',language);

/** Pure assembly seam for tests and other template providers. */
export function frameworkTemplateFromFiles(framework:TemplateFramework,language:FrameworkLanguage,bundled:Readonly<Record<string,string>>):FrameworkTemplate{
 if(!TEMPLATE_FRAMEWORKS.includes(framework))throw Error('Invalid template');
 const prefix=`./templates/${framework}-${language}/`;
 const files=Object.fromEntries(Object.entries(bundled).filter(([path])=>path.startsWith(prefix)).map(([path,text])=>[path.slice(prefix.length),text]));
 if(!files['somnia.template.json'])throw Error('Invalid template');
 const manifest=validateTemplateManifest(JSON.parse(files['somnia.template.json']));
 if(manifest.framework!==framework||manifest.language!==language)throw Error('Invalid template');
 return {manifest,files};
}
export const reactTemplateFromFiles=(language:FrameworkLanguage,bundled:Readonly<Record<string,string>>)=>frameworkTemplateFromFiles('react',language,bundled);

/** Server rendered templates (Next, Astro, SvelteKit, Nuxt). Same lazy asset bundle, separate manifest validator. */
export async function serverFrameworkTemplate(framework:ServerTemplateFramework,language:FrameworkLanguage):Promise<ServerFrameworkTemplate>{
 const {templateFiles}=await import('./templateBundle.vite');
 return serverTemplateFromFiles(framework,language,templateFiles);
}
export function serverTemplateFromFiles(framework:ServerTemplateFramework,language:FrameworkLanguage,bundled:Readonly<Record<string,string>>):ServerFrameworkTemplate{
 if(!SERVER_TEMPLATE_FRAMEWORKS.includes(framework))throw Error('Invalid template');
 const prefix=`./templates/${framework}-${language}/`;
 const files=Object.fromEntries(Object.entries(bundled).filter(([path])=>path.startsWith(prefix)).map(([path,text])=>[path.slice(prefix.length),text]));
 if(!files['somnia.template.json'])throw Error('Invalid template');
 const manifest=validateServerTemplateManifest(JSON.parse(files['somnia.template.json']));
 if(manifest.framework!==framework||manifest.language!==language)throw Error('Invalid template');
 return {manifest,files};
}
