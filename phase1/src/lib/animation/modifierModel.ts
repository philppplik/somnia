/** Modifier model and validation: a leaf module so document validation (model.ts) does not pull in evaluation. */
export type Modifier=
 |{type:'wiggle';seed:number;amplitude:number;frequency:number}
 |{type:'loop';mode:'cycle'|'pingpong'|'offset'}
 /** Binds the property to another layer's transform property of the same composition: value = source * multiplier + offset, per channel. Replaces the keyed value; a wiggle after it still adds. No scripting. */
 |{type:'link';layer:string;prop:LinkProp;multiplier:number;offset:number;/** Follow-the-leader lag in ticks: the source is read at t - delay. Absent means 0. */delay?:number};
export const LINK_PROPS=['anchor','position','scale','rotation','opacity'] as const;
export type LinkProp=typeof LINK_PROPS[number];
export const LINK_MAX_DELAY=2400000,LINK_MAX_MULTIPLIER=1000,LINK_MAX_OFFSET=100000,MAX_LINK_DEPTH=8;

export const WIGGLE_MAX_AMPLITUDE=10000,WIGGLE_MAX_FREQUENCY=100;

export function validateModifiers(ms:readonly Modifier[]|undefined):string[]{
 if(!ms)return [];const bad:string[]=[];
 for(const m of ms){
  if(m.type==='wiggle'){
   if(!Number.isInteger(m.seed)||m.seed<0||m.seed>2**31-1)bad.push('wiggle seed must be an integer between 0 and 2^31-1');
   if(!(m.amplitude>=0&&m.amplitude<=WIGGLE_MAX_AMPLITUDE))bad.push(`wiggle amplitude must be between 0 and ${WIGGLE_MAX_AMPLITUDE}`);
   if(!(m.frequency>0&&m.frequency<=WIGGLE_MAX_FREQUENCY))bad.push(`wiggle frequency must be between 0 and ${WIGGLE_MAX_FREQUENCY}`);
  }else if(m.type==='loop'){if(!['cycle','pingpong','offset'].includes(m.mode))bad.push('loop mode must be cycle, pingpong or offset');}
  else if(m.type==='link'){
   if(typeof m.layer!=='string'||!m.layer.length||m.layer.length>64)bad.push('link needs a layer id');
   if(!(LINK_PROPS as readonly string[]).includes(m.prop))bad.push('link property must be one of '+LINK_PROPS.join(', '));
   if(!(Number.isFinite(m.multiplier)&&Math.abs(m.multiplier)<=LINK_MAX_MULTIPLIER))bad.push(`link multiplier must be between -${LINK_MAX_MULTIPLIER} and ${LINK_MAX_MULTIPLIER}`);
   if(m.delay!==undefined&&!(Number.isInteger(m.delay)&&Math.abs(m.delay)<=LINK_MAX_DELAY))bad.push(`link delay must be a whole number of ticks between -${LINK_MAX_DELAY} and ${LINK_MAX_DELAY}`);
   if(!(Number.isFinite(m.offset)&&Math.abs(m.offset)<=LINK_MAX_OFFSET))bad.push(`link offset must be between -${LINK_MAX_OFFSET} and ${LINK_MAX_OFFSET}`);
  }
  else bad.push('unknown modifier type');
 }
 return bad;
}

type LinkLayer={id:string;transform:Readonly<Record<string,{type:string;modifiers?:readonly Modifier[]}|undefined>>};
/** Problems of the links in one composition: at most one per property, never to itself, same value type, no cycles. Links to layers that no longer exist are inert, not errors. */
export function linkProblems(layers:readonly LinkLayer[]):string[]{
 const bad:string[]=[],byId=new Map(layers.map(l=>[l.id,l]));
 const edge=new Map<string,string>();
 for(const l of layers)for(const [k,p] of Object.entries(l.transform)){
  const links=(p?.modifiers??[]).filter((m):m is Extract<Modifier,{type:'link'}>=>m.type==='link');
  if(links.length>1)bad.push(`${l.id}.${k}: only one link per property`);
  const m=links[0];if(!m)continue;
  if(m.layer===l.id&&m.prop===k){bad.push(`${l.id}.${k}: a property cannot link to itself`);continue;}
  const src=byId.get(m.layer)?.transform[m.prop];if(!src)continue;
  if(src.type!==p!.type)bad.push(`${l.id}.${k}: link needs a property of the same kind`);
  edge.set(`${l.id}.${k}`,`${m.layer}.${m.prop}`);
 }
 for(const start of edge.keys()){const seen=new Set<string>();let cur:string|undefined=start;while(cur&&!seen.has(cur)){seen.add(cur);cur=edge.get(cur);if(cur===start){bad.push(`${start}: links form a loop`);break;}}}
 return [...new Set(bad)].slice(0,10);
}
