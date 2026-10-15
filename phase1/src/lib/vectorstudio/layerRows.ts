import type {VectorPath} from '../vectorio';

export type LayerRow={kind:'group';group:string;ids:string[];shown:number}|{kind:'path';path:VectorPath;indent:boolean};

/** Layers panel rows, topmost first. Members of a group are listed together under one header at the position of the
 *  group's topmost member; `collapsed` groups show the header only. `match` filters paths; a group stays while any member matches. */
export function layerRows(paths:readonly VectorPath[],match:(p:VectorPath)=>boolean,collapsed:ReadonlySet<string>=new Set()):LayerRow[]{
 const rows:LayerRow[]=[],done=new Set<string>(),top=[...paths].reverse();
 for(const p of top){
  if(p.group===undefined){if(match(p))rows.push({kind:'path',path:p,indent:false});continue;}
  if(done.has(p.group))continue;done.add(p.group);
  const members=top.filter(q=>q.group===p.group),shown=members.filter(match);
  if(!shown.length)continue;
  rows.push({kind:'group',group:p.group,ids:members.map(q=>q.id),shown:shown.length});
  if(!collapsed.has(p.group))for(const q of shown)rows.push({kind:'path',path:q,indent:true});
 }
 return rows;
}
