// Editor-core benchmarks. Run: npm run bench. Fails when a budget is exceeded (budgets are generous so shared CI runners stay green).
import {EditorProject} from '../packages/editor-core/src/index';
const make=(n:number)=>`<!doctype html><html><head><title>b</title></head><body>${Array.from({length:n},(_,i)=>`<section class="s${i}"><h2>Title ${i}</h2><p>Paragraph <em>${i}</em> with <a href="#${i}">link</a></p></section>`).join('\n')}</body></html>`;
const time=<T>(f:()=>T):[T,number]=>{const t=performance.now();const r=f();return [r,performance.now()-t];};
const rows:{case:string;nodes:number;kb:number;ms:number;budget:number}[]=[];
const flat=(ns:any[]):any[]=>ns.flatMap(n=>[n,...flat(n.children)]);
let failed=false;EditorProject.incremental.enabled=process.env.SOMNIA_INCREMENTAL==='1';
for(const [n,parseBudget] of [[200,400],[2000,2500],[10000,12000]] as const){
 const html=make(n);const [p,ms]=time(()=>new EditorProject({'index.html':html}));
 const nodes=flat(p.tree('index.html')).length;rows.push({case:`parse ${n} sections`,nodes,kb:Math.round(html.length/1024),ms:Math.round(ms),budget:parseBudget});
 const h=flat(p.tree('index.html')).find((x:any)=>x.tag==='h2');
 const [,ms2]=time(()=>p.transact({origin:'canvas',operations:[{type:'setAttribute',file:'index.html',nodeId:h.id,name:'title',value:'x'}]}));
 rows.push({case:`one edit in ${n}-section doc`,nodes,kb:Math.round(html.length/1024),ms:Math.round(ms2),budget:Math.max(200,parseBudget/4)});
 const [,ms3]=time(()=>p.undo());rows.push({case:`undo in ${n}-section doc`,nodes,kb:Math.round(html.length/1024),ms:Math.round(ms3),budget:Math.max(200,parseBudget/4)});
}
console.table(rows);
for(const r of rows)if(r.ms>r.budget){failed=true;console.error(`BUDGET EXCEEDED: ${r.case} took ${r.ms} ms (budget ${r.budget} ms)`);}
process.exit(failed?1:0);
