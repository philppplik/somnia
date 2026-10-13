/** Local only: pinned templates are installed and built in throwaway directories, never a remote host. */
import {cpSync,mkdtempSync,readFileSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join,resolve} from 'node:path';import {spawnSync} from 'node:child_process';
const root=resolve(import.meta.dirname,'..');const report=[];
for(const language of ['ts','js']){
 const dir=mkdtempSync(join(tmpdir(),'somnia-template-'));
 try{
  cpSync(join(root,'src/lib/frameworks/templates/react-'+language),dir,{recursive:true});
  for(const args of [['ci','--ignore-scripts'],['run','build']]){const result=spawnSync(process.platform==='win32'?'npm.cmd':'npm',args,{cwd:dir,encoding:'utf8',timeout:300000,shell:false});if(result.status!==0)throw Error(`${language} ${args.join(' ')} failed: ${result.stderr}`);}
  if(!existsSync(join(dir,'dist/index.html')))throw Error('Missing artifact');
  const html=readFileSync(join(dir,'dist/index.html'),'utf8');if(/(?:src|href)=["']https?:\/\//.test(html))throw Error('External asset in template');
  report.push({language,build:'passed',artifact:'dist/index.html'});
 }finally{rmSync(dir,{recursive:true,force:true});}
}
console.log(JSON.stringify({templates:report},null,2));
