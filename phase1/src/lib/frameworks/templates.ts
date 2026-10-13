import {validateTemplateManifest,templateEntryFile,TEMPLATE_FRAMEWORKS,type FrameworkLanguage,type FrameworkTemplate,type TemplateFramework} from './templateManifest';
export type {FrameworkLanguage,FrameworkTemplate,TemplateFramework} from './templateManifest';
export {templateEntryFile,TEMPLATE_FRAMEWORKS,FRAMEWORK_LABELS} from './templateManifest';

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
