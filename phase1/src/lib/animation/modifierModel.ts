/** Modifier model and validation: a leaf module so document validation (model.ts) does not pull in evaluation. */
export type Modifier=
 |{type:'wiggle';seed:number;amplitude:number;frequency:number}
 |{type:'loop';mode:'cycle'|'pingpong'|'offset'};

export const WIGGLE_MAX_AMPLITUDE=10000,WIGGLE_MAX_FREQUENCY=100;

export function validateModifiers(ms:readonly Modifier[]|undefined):string[]{
 if(!ms)return [];const bad:string[]=[];
 for(const m of ms){
  if(m.type==='wiggle'){
   if(!Number.isInteger(m.seed)||m.seed<0||m.seed>2**31-1)bad.push('wiggle seed must be an integer between 0 and 2^31-1');
   if(!(m.amplitude>=0&&m.amplitude<=WIGGLE_MAX_AMPLITUDE))bad.push(`wiggle amplitude must be between 0 and ${WIGGLE_MAX_AMPLITUDE}`);
   if(!(m.frequency>0&&m.frequency<=WIGGLE_MAX_FREQUENCY))bad.push(`wiggle frequency must be between 0 and ${WIGGLE_MAX_FREQUENCY}`);
  }else if(m.type==='loop'){if(!['cycle','pingpong','offset'].includes(m.mode))bad.push('loop mode must be cycle, pingpong or offset');}
  else bad.push('unknown modifier type');
 }
 return bad;
}
