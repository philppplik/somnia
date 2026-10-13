import {validateTemplateManifest,type FrameworkLanguage,type FrameworkTemplate} from './templateManifest';
export type {FrameworkLanguage,FrameworkTemplate} from './templateManifest';
const bundled=import.meta.glob('./templates/react-*/**/*',{query:'?raw',import:'default',eager:true}) as Record<string,string>;
// Vite glob omits dotfiles unless requested explicitly.
const hidden=import.meta.glob(['./templates/react-*/.gitignore'],{query:'?raw',import:'default',eager:true}) as Record<string,string>;
export function reactTemplate(language:FrameworkLanguage):FrameworkTemplate{
 const prefix=`./templates/react-${language}/`;const files=Object.fromEntries(Object.entries({...bundled,...hidden}).filter(([path])=>path.startsWith(prefix)).map(([path,text])=>[path.slice(prefix.length),text]));
 return {manifest:validateTemplateManifest(JSON.parse(files['somnia.template.json'])),files};
}
