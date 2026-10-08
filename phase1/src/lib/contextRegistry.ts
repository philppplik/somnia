import type {UiContext,Domain} from './uiContext';
export type SectionMode=false|'pin'|'show'|'grey';
export interface ContextSection {id:string;panel:'inspector'|'left';order:number;when:(ctx:UiContext)=>SectionMode;greyReason?:string}
const registry=new Map<string,ContextSection>();
export function registerSection(section:ContextSection){registry.set(section.id,section);return()=>{registry.delete(section.id);};}
const web=(ctx:UiContext)=>ctx.domain==='web';
const specs:ContextSection[]=[
 {id:'page',panel:'inspector',order:0,when:c=>web(c)&&c.selection.kind==='none'?'pin':false},
 {id:'cursor',panel:'inspector',order:1,when:c=>c.surface==='code'?'pin':false},
 {id:'typography',panel:'inspector',order:30,greyReason:'ctx.noText',when:c=>!web(c)||c.selection.kind==='none'?false:c.selection.kind==='text'?'pin':'grey'},
 {id:'image',panel:'inspector',order:2,when:c=>web(c)&&c.selection.kind==='image'?'pin':false},
 {id:'media',panel:'inspector',order:3,when:c=>web(c)&&c.selection.kind==='media'?'pin':false},
 {id:'form',panel:'inspector',order:4,when:c=>web(c)&&c.selection.kind==='form-control'?'pin':false},
 {id:'component',panel:'inspector',order:5,when:c=>c.selection.kind==='container'&&c.selection.isComponent?'pin':false},
 {id:'multi',panel:'inspector',order:6,when:c=>c.selection.kind==='multi'?'pin':false},
 {id:'content',panel:'inspector',order:8,when:c=>c.selection.kind==='text'?'show':false},
 {id:'layout',panel:'inspector',order:10,when:c=>!web(c)||c.selection.kind==='none'?false:c.selection.kind==='container'&&!c.selection.isComponent?'pin':'show'},
 {id:'style',panel:'inspector',order:20,when:c=>web(c)&&c.selection.kind!=='none'?'show':false},
 {id:'effects',panel:'inspector',order:40,when:c=>web(c)&&c.selection.kind!=='none'?'show':false},
 {id:'advanced',panel:'inspector',order:50,greyReason:'ctx.multiUnavailable',when:c=>!web(c)||c.selection.kind==='none'?false:c.selection.kind==='multi'?'grey':'show'},
 {id:'computed',panel:'inspector',order:60,when:c=>web(c)&&c.selection.kind!=='none'?'show':false},
];specs.forEach(registerSection);
export function sectionsFor(ctx:UiContext,panel:'inspector'|'left'='inspector'){return [...registry.values()].filter(s=>s.panel===panel&&s.when(ctx)).sort((a,b)=>{const tier=(s:ContextSection)=>s.when(ctx)==='pin'?0:s.when(ctx)==='grey'?2:1;return tier(a)-tier(b)||a.order-b.order;});}
export const WEB_RAIL=['layers','files','search','assets','components','css','versions'] as const;
export function railFor(domain:Domain,side:'left'|'right'):readonly string[]{if(side==='right')return ['design','prototype','code'];return domain==='code-only'?['files','search','versions']:WEB_RAIL;}
