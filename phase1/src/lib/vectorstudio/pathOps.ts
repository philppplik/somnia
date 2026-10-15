import type {VectorDocument,VectorNode,VectorPath} from '../vectorio';
import {selectedPaths} from './selectionClosure';
import {newId} from './shapes';

export const JOIN_SNAP=0.5; // endpoints closer than this (document units) merge into one node
const dist=(a:VectorNode,b:VectorNode)=>Math.hypot(a.x-b.x,a.y-b.y);
const strip=(n:VectorNode,side:'in'|'out'):VectorNode=>{const c={...n};delete c[side];return c;};
const fresh=(n:VectorNode):VectorNode=>({...n,id:newId('n')});
const swapped=(n:VectorNode):VectorNode=>{const c={...n};delete c.in;delete c.out;if(n.out)c.in=n.out;if(n.in)c.out=n.in;return c;};
const meta=(p:VectorPath)=>{const {id:_i,nodes:_n,closed:_c,...rest}=p;return rest;};

/** Split at a node. Open path: two open paths sharing the position of that interior node. Closed path: one open path that starts and ends there.
 *  Compound contours and end nodes of open paths are refused (nothing sensible to split). Returns the new path ids in order. */
export function splitPath(doc:VectorDocument,pathId:string,nodeId:string):{doc:VectorDocument;ids:string[]}{
 const at=doc.paths.findIndex(p=>p.id===pathId);if(at<0)throw new Error('Unknown path');
 const p=doc.paths[at],i=p.nodes.findIndex(n=>n.id===nodeId);if(i<0)throw new Error('Unknown node');
 if(p.compound!==undefined)throw new Error('Compound paths cannot be split');
 const n=p.nodes.length;
 let pieces:VectorNode[][];
 if(p.closed){
  if(n<2)throw new Error('Path is too short to split');
  const rot=[...p.nodes.slice(i),...p.nodes.slice(0,i)];
  const head=strip(rot[0],'in'),tail=strip(fresh(rot[0]),'out');
  if(rot[0].in)tail.in=rot[0].in;
  pieces=[[head,...rot.slice(1),tail]];
 }else{
  if(i===0||i===n-1)throw new Error('Choose a node inside the path');
  const a=[...p.nodes.slice(0,i),strip(p.nodes[i],'out')],b=[strip(fresh(p.nodes[i]),'in'),...p.nodes.slice(i+1)];
  b[0]={...b[0],...(p.nodes[i].out?{out:p.nodes[i].out}:{})};
  pieces=[a,b];
 }
 const made:VectorPath[]=pieces.map((nodes,k)=>({...meta(p),id:k===0?p.id:newId('p'),closed:false,nodes}));
 const paths=[...doc.paths.slice(0,at),...made,...doc.paths.slice(at+1)];
 return {doc:{...doc,paths},ids:made.map(m=>m.id)};
}

/** Join the two selected open paths at their nearest endpoints. Coincident endpoints (<= JOIN_SNAP) become one node,
 *  otherwise a straight segment connects them. The result keeps the lower path's position, style and name. */
export function joinPaths(doc:VectorDocument,ids:readonly string[]):{doc:VectorDocument;id:string}{
 const sel=selectedPaths(doc,ids);
 if(sel.length!==2)throw new Error('Select exactly two open paths');
 if(sel.some(p=>p.closed||p.compound!==undefined||p.nodes.length<2))throw new Error('Both paths must be open with at least two nodes');
 const [a,b]=sel;
 let best:{ae:0|1;be:0|1;d:number}|null=null;
 for(const ae of [0,1] as const)for(const be of [0,1] as const){
  const d=dist(a.nodes[ae?a.nodes.length-1:0],b.nodes[be?b.nodes.length-1:0]);if(!best||d<best.d)best={ae,be,d};
 }
 const {ae,be,d}=best!;
 const first=ae===1?a.nodes:[...a.nodes].reverse().map(swapped); // ends at the joint
 const second=be===0?b.nodes:[...b.nodes].reverse().map(swapped); // starts at the joint
 let nodes:VectorNode[];
 if(d<=JOIN_SNAP){
  const x=first[first.length-1],y=second[0],merged:VectorNode={...x,kind:'corner'};
  if(y.out)merged.out=y.out;else delete merged.out;
  nodes=[...first.slice(0,-1),merged,...second.slice(1)];
 }else nodes=[...first,...second];
 const keep=doc.paths.indexOf(a),drop=doc.paths.indexOf(b);
 const joined:VectorPath={...a,nodes,closed:false};
 const paths=doc.paths.map((p,k)=>k===keep?joined:p).filter((_p,k)=>k!==drop);
 return {doc:{...doc,paths},id:a.id};
}

/** Reverse the drawing direction of every selected path (handles swap sides; closed paths keep their first node). */
export function reverseSelection(doc:VectorDocument,ids:readonly string[]):VectorDocument{
 const set=new Set(selectedPaths(doc,ids).map(p=>p.id));if(!set.size)return doc;
 return {...doc,paths:doc.paths.map(p=>{
  if(!set.has(p.id))return p;
  const rev=[...p.nodes].reverse().map(swapped);
  const nodes=p.closed&&rev.length>1?[rev[rev.length-1],...rev.slice(0,-1)]:rev;
  return {...p,nodes};
 })};
}
