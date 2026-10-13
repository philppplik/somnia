export type FrameworkLanguage='ts'|'js';
export interface TemplateManifest {id:string;framework:'react';language:FrameworkLanguage;output:'static';scripts:{dev:'dev';build:'build'};artifactPath:'dist'}
export interface FrameworkTemplate {manifest:TemplateManifest;files:Readonly<Record<string,string>>}
export function validateTemplateManifest(value:unknown):TemplateManifest{
 if(!value||typeof value!=='object')throw Error('Invalid template');const v=value as Record<string,unknown>;const scripts=v.scripts as Record<string,unknown>|undefined;
 if(!['react-ts','react-js'].includes(String(v.id))||v.framework!=='react'||!['ts','js'].includes(String(v.language))||v.id!==`react-${v.language}`||v.output!=='static'||v.artifactPath!=='dist'||scripts?.dev!=='dev'||scripts?.build!=='build')throw Error('Invalid template');
 return {id:String(v.id),framework:'react',language:v.language as FrameworkLanguage,output:'static',scripts:{dev:'dev',build:'build'},artifactPath:'dist'};
}
