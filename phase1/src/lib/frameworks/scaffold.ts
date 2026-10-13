import {validateTemplateManifest,validateServerTemplateManifest,type FrameworkTemplate,type ServerFrameworkTemplate} from './templateManifest';
export function validateProjectName(name:string):string{
 const n=name.trim();if(!/^[a-z][a-z0-9-]{0,63}$/.test(n)||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/.test(n))throw Error('frameworks.invalidName');return n;
}
export function safeScaffoldPath(path:string):boolean{
 return !!path&&!path.startsWith('/')&&!/[\\:\x00-\x1f<>"|?*]/.test(path)&&path.split('/').every(p=>p!==''&&p!=='.'&&p!=='..'&&!/[. ]$/.test(p)&&! /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p))&&!path.split('/').includes('.git')&&!path.split('/').includes('node_modules');
}
/** Pure plan, no disk writes or code execution. Never replace an existing file. */
export function scaffoldProject(template:FrameworkTemplate|ServerFrameworkTemplate,name:string,existing:readonly string[]=[]):Record<string,string>{
 const slug=validateProjectName(name);(template.manifest.output==='node'?validateServerTemplateManifest:validateTemplateManifest)(template.manifest);
 const taken=new Set(existing.map(p=>p.toLowerCase()));const out:Record<string,string>=Object.create(null);let size=0;
 for(const [path,text] of Object.entries(template.files)){
  if(!safeScaffoldPath(path)||taken.has(path.toLowerCase())||typeof text!=='string')throw Error('frameworks.overwrite');
  taken.add(path.toLowerCase());const value=text.replaceAll('{{name}}',slug);size+=new TextEncoder().encode(value).length;
  if(size>4*1024*1024||Object.keys(out).length>=100)throw Error('frameworks.templateLimit');out[path]=value;
 }
 if(!out['package-lock.json']||!out['somnia.template.json']||!out['package.json'])throw Error('frameworks.invalidTemplate');
 const pkg=JSON.parse(out['package.json']);pkg.name=slug;out['package.json']=JSON.stringify(pkg,null,2)+'\n';
 const lock=JSON.parse(out['package-lock.json']);lock.name=slug;if(lock.packages?.[''])lock.packages[''].name=slug;out['package-lock.json']=JSON.stringify(lock,null,2)+'\n';
 return out;
}
