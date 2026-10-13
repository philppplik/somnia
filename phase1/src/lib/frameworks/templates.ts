import {validateTemplateManifest,type FrameworkLanguage,type FrameworkTemplate} from './templateManifest';
export type {FrameworkLanguage,FrameworkTemplate} from './templateManifest';

/** Importing this public module is safe in Node. Only an explicit scaffold request loads Vite assets. */
export async function reactTemplate(language:FrameworkLanguage):Promise<FrameworkTemplate>{
 const {templateFiles}=await import('./templateBundle.vite');
 return reactTemplateFromFiles(language,templateFiles);
}

/** Pure assembly seam for tests and other template providers. */
export function reactTemplateFromFiles(language:FrameworkLanguage,bundled:Readonly<Record<string,string>>):FrameworkTemplate{
 const prefix=`./templates/react-${language}/`;
 const files=Object.fromEntries(Object.entries(bundled).filter(([path])=>path.startsWith(prefix)).map(([path,text])=>[path.slice(prefix.length),text]));
 return {manifest:validateTemplateManifest(JSON.parse(files['somnia.template.json'])),files};
}
