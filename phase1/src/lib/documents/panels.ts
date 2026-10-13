import type {InspectorSectionDef,PanelDef} from '../shell/types';
import type {DocBlock} from './edit';
import {utf16ToUtf8Offset} from './text';

export const DOCUMENTS_PANELS:readonly PanelDef[]=[
 {id:'outline',title:'Paragraphs',titleKey:'documents.panel.outline',component:'documents.outline',side:'left',icon:'ListTree',defaultOpen:true,commands:['documents.focusParagraph']},
 {id:'find',title:'Find and replace',titleKey:'documents.panel.find',component:'documents.find',side:'left',icon:'Search',commands:['documents.selectMatch','documents.replaceMatch']},
];
export const DOCUMENTS_INSPECTOR_SECTIONS:readonly InspectorSectionDef[]=[
 {id:'document',title:'Document',titleKey:'documents.panel.document',component:'documents.inspector.document',order:10,commands:['documents.goToPage','documents.setZoom','documents.panelUndo','documents.panelRedo']},
 {id:'selection',title:'Paragraph inspector',titleKey:'documents.panel.selection',component:'documents.inspector.selection',when:"selection.kind != 'none'",order:20,commands:['documents.commitParagraph','documents.selectParagraph','documents.clearSelection']},
];
export const PANEL_COMMAND_TITLES={focusParagraph:'Focus paragraph',selectMatch:'Select search result',replaceMatch:'Replace search result',goToPage:'Go to document page',setZoom:'Set document zoom',panelUndo:'Undo document edit',panelRedo:'Redo document edit',commitParagraph:'Apply paragraph text',selectParagraph:'Select entire paragraph',clearSelection:'Clear document selection'};
export const DOCUMENTS_PANEL_COMMANDS:readonly string[]=Object.keys(PANEL_COMMAND_TITLES).map(id=>`documents.${id}`);
export interface DocumentMatch {block:number;start:number;end:number;excerpt:string;expected:string}
/** Literal, non-overlapping search. Offsets are UTF-8, just like the engine. Tables and object paragraphs are excluded. */
export function findDocumentMatches(blocks:readonly DocBlock[],query:string,matchCase=false,limit=500):DocumentMatch[]{
 if(!query||limit<=0)return[];
 const hits:DocumentMatch[]=[];
 // Escape user input instead of treating it as a regular expression. Unicode case matching preserves source indexes.
 const re=new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),matchCase?'gu':'giu');
 for(const b of blocks){if(!b.editable||b.text===undefined)continue;for(const m of b.text.matchAll(re)){
  const at=m.index!;hits.push({block:b.index,start:utf16ToUtf8Offset(b.text,at),end:utf16ToUtf8Offset(b.text,at+m[0].length),expected:m[0],excerpt:b.text.slice(Math.max(0,at-24),Math.min(b.text.length,at+m[0].length+48))});
  if(hits.length>=limit)return hits;
 }}return hits;
}
export function documentStatistics(blocks:readonly DocBlock[]){const texts=blocks.flatMap(b=>b.text===undefined?[]:[b.text]);return {paragraphs:blocks.filter(b=>b.kind==='para').length,tables:blocks.filter(b=>b.kind==='table').length,editable:blocks.filter(b=>b.editable).length,characters:Array.from(texts.join('')).length,words:texts.join(' ').split(/\s+/u).filter(Boolean).length};}
