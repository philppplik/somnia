/** Burst detection for auto-stacking: names that share a prefix and differ only in a trailing number form a series when the numbers are consecutive (IMG_1234..IMG_1237). Extension-agnostic; input order does not matter. */
export function detectSeries(names:readonly string[]):string[][]{
 const parsed:{name:string;prefix:string;num:number}[]=[];
 for(const n of names){
  const base=n.replace(/\.[^.\\/]+$/,'');
  const m=base.match(/^(.*?)(\d+)$/);
  if(m)parsed.push({name:n,prefix:m[1],num:parseInt(m[2],10)});
 }
 const byPrefix=new Map<string,typeof parsed>();
 for(const p of parsed){const l=byPrefix.get(p.prefix);if(l)l.push(p);else byPrefix.set(p.prefix,[p]);}
 const out:string[][]=[];
 for(const list of byPrefix.values()){
  list.sort((a,b)=>a.num-b.num);
  let run=[list[0]];
  for(let i=1;i<list.length;i++){
   if(list[i].num===list[i-1].num+1)run.push(list[i]);
   else{if(run.length>=2)out.push(run.map(r=>r.name));run=[list[i]];}
  }
  if(run.length>=2)out.push(run.map(r=>r.name));
 }
 return out;
}
