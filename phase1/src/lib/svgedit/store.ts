import {useSyncExternalStore} from 'react';
export type Tool='select'|'node'|'rect'|'ellipse'|'line'|'pen'|'text';
export interface DrawStyle{fill:string;stroke:string;strokeWidth:number}
export interface SvgUi{tool:Tool;selection:string[];zoom:number;fit:boolean;draw:DrawStyle;locked:string[];collapsed:string[];node:{c:number;i:number}|null;version:number;cursor:{x:number;y:number}|null;notice:string;inspectorTab:'design'|'color'|'code';snap:boolean;grid:number;guides:Guide[]}
import type {Guide} from './snap';
let ui:SvgUi={tool:'select',selection:[],zoom:1,fit:true,draw:{fill:'#6d5ef5',stroke:'none',strokeWidth:2},locked:[],collapsed:[],node:null,version:0,cursor:null,notice:'',inspectorTab:'design',snap:true,grid:0,guides:[]};
const ls=new Set<() => void>();
export const getUi=()=>ui;
export function patchUi(p:Partial<SvgUi>){ui={...ui,...p};ls.forEach(l=>l());}
export const useSvgUi=()=>useSyncExternalStore(f=>{ls.add(f);return()=>{ls.delete(f);};},getUi,getUi);
export const bump=()=>patchUi({version:ui.version+1});
let cur:{x:number;y:number}|null=null;const cl=new Set<() => void>();
export const setCursor=(c:{x:number;y:number}|null)=>{cur=c;cl.forEach(l=>l());};
export const useCursor=()=>useSyncExternalStore(f=>{cl.add(f);return()=>{cl.delete(f);};},()=>cur,()=>cur);
