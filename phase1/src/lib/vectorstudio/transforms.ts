import type {VectorDocument,Point} from '../vectorio';
import {boxOf} from './geometry';
/** Geometry-only transforms preserve stroke widths and compound membership. */
function chosen(doc:VectorDocument,ids:readonly string[]){const groups=new Set(doc.paths.filter(p=>ids.includes(p.id)&&!p.hidden&&p.compound).map(p=>p.compound));return doc.paths.filter(p=>!p.hidden&&(ids.includes(p.id)||!!(p.compound&&groups.has(p.compound))));}
export function selectionBounds(doc:VectorDocument,ids:readonly string[]){const b=boxOf(chosen(doc,ids));return b?{x:b.minX,y:b.minY,width:b.maxX-b.minX,height:b.maxY-b.minY}:null;}
function transform(doc:VectorDocument,ids:readonly string[],fn:(pt:Point)=>Point):VectorDocument{const keys=new Set(chosen(doc,ids).map(p=>p.id));return {...doc,paths:doc.paths.map(p=>!keys.has(p.id)?p:{...p,nodes:p.nodes.map(n=>({...n,...fn(n),...(n.in?{in:fn(n.in)}:{}),...(n.out?{out:fn(n.out)}:{})}))})};}
export function scaleSelection(doc:VectorDocument,ids:readonly string[],sx:number,sy:number,origin:Point){return transform(doc,ids,p=>({x:origin.x+(p.x-origin.x)*sx,y:origin.y+(p.y-origin.y)*sy}));}
export function rotateSelection(doc:VectorDocument,ids:readonly string[],degrees:number){const b=selectionBounds(doc,ids);if(!b)return doc;const cx=b.x+b.width/2,cy=b.y+b.height/2,a=degrees*Math.PI/180,c=Math.cos(a),s=Math.sin(a);return transform(doc,ids,p=>({x:cx+(p.x-cx)*c-(p.y-cy)*s,y:cy+(p.x-cx)*s+(p.y-cy)*c}));}
