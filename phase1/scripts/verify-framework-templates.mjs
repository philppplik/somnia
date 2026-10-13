/** Local only: pinned templates are installed and built in throwaway directories, never a remote host. */
import {cpSync,mkdtempSync,readFileSync,readdirSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join,resolve} from 'node:path';import {spawnSync} from 'node:child_process';
const root=resolve(import.meta.dirname,'..');const report=[];
for(const id of ['react','vue','svelte','solid'].flatMap(f=>['ts','js'].map(l=>`${f}-${l}`))){
 const dir=mkdtempSync(join(tmpdir(),'somnia-template-'));
 try{
  cpSync(join(root,'src/lib/frameworks/templates/'+id),dir,{recursive:true});
  for(const args of [['ci','--ignore-scripts'],['run','build']]){const result=spawnSync(process.platform==='win32'?'npm.cmd':'npm',args,{cwd:dir,encoding:'utf8',timeout:300000,shell:false});if(result.status!==0)throw Error(`${id} ${args.join(' ')} failed: ${result.stderr}`);}
  if(!existsSync(join(dir,'dist/index.html')))throw Error('Missing artifact');
  const html=readFileSync(join(dir,'dist/index.html'),'utf8');if(/(?:src|href)=["']https?:\/\//.test(html))throw Error('External asset in template');
  const assets=readdirSync(join(dir,'dist/assets')).map(f=>readFileSync(join(dir,'dist/assets',f),'utf8')).join('\n');if(/data-somnia-src|__somnia/.test(assets+html))throw Error(`${id}: dev-only markers leaked into the production build`);
  report.push({template:id,build:'passed',artifact:'dist/index.html'});
 }finally{rmSync(dir,{recursive:true,force:true});}
}
console.log(JSON.stringify({templates:report},null,2));
