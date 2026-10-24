import {registerCommandSpec} from '../commandBridge';
import {commandDispatcher} from '../commandDispatcher';
import type {CommandSpec} from '../commandSpec';
import {getStudioContext} from '../shell/studioContext';
import {getDocumentsState,patchDocuments} from './store';
import {getEngine,editParagraph,undoEdit,redoEdit,selectAllInParagraph,clearCaret,syncGeometry,typeText} from './session';
import {utf8ToUtf16Offset,utf16ToUtf8Offset} from './text';
import {PANEL_COMMAND_TITLES} from './panels';
import './panelI18n';
import {t} from '../i18n';
const empty={type:'object',properties:{},additionalProperties:false};
const object=(properties:Record<string,unknown>,required:string[])=>({type:'object',properties,required,additionalProperties:false});
const integer={type:'integer',minimum:0};
export function documentPanelReady(write=false){const d=getDocumentsState(),c=getStudioContext();return c.studio==='documents'&&c.document?.id===d.name&&d.status==='ready'&&!!getEngine()&&!c.busy&&(!write||!c.document.readOnly);}
function blockAt(block:number,write=false){if(!documentPanelReady(write))throw new Error(t('documents.panels.error.unavailable'));const b=getDocumentsState().blocks.find(x=>x.index===block);if(!b?.editable||b.text===undefined)throw new Error(t('documents.panels.error.notEditable'));return b;}
async function reveal(){await syncGeometry();const box=getDocumentsState().caretBox;if(box&&typeof document!=='undefined')document.querySelector(`[data-testid="documents-page"][data-page="${box.page+1}"]`)?.scrollIntoView({block:'nearest'});}
export function createDocumentPanelCommands():CommandSpec<any,any>[]{
 const make=(name:keyof typeof PANEL_COMMAND_TITLES,params:Record<string,unknown>,run:CommandSpec<any,any>['run'],write=false,extra=()=>true):CommandSpec<any,any>=>({id:`documents.${name}`,title:PANEL_COMMAND_TITLES[name],category:name==='panelUndo'||name==='panelRedo'||write?'Edit':'View',level:'ui',params,allowInInput:true,enabled:()=>documentPanelReady(write)&&extra(),run});
 return[
  make('focusParagraph',object({block:integer},['block']),async(p:{block:number})=>{blockAt(p.block);patchDocuments({caret:{block:p.block,anchor:0,head:0},caretLocked:false});await reveal();}),
  make('selectMatch',object({block:integer,start:integer,end:integer,expected:{type:'string'}},['block','start','end','expected']),async(p:{block:number;start:number;end:number;expected:string})=>{const b=blockAt(p.block);checkMatch(b.text!,p);patchDocuments({caret:{block:p.block,anchor:p.start,head:p.end},caretLocked:false});await reveal();}),
  make('replaceMatch',object({block:integer,start:integer,end:integer,expected:{type:'string'},text:{type:'string',maxLength:100000}},['block','start','end','expected','text']),async(p:{block:number;start:number;end:number;expected:string;text:string})=>{const b=blockAt(p.block,true);checkMatch(b.text!,p);patchDocuments({caret:{block:p.block,anchor:p.start,head:p.end},caretLocked:false});await typeText(p.text||'');if(!p.text){const {deleteAtCaret}=await import('./session');await deleteAtCaret(-1);}if(getDocumentsState().editError)throw new Error(getDocumentsState().editError);await reveal();},true),
  make('commitParagraph',object({block:integer,before:{type:'string'},text:{type:'string',maxLength:1000000}},['block','before','text']),async(p:{block:number;before:string;text:string})=>{const b=blockAt(p.block,true);if(b.text!==p.before)throw new Error(t('documents.panels.error.changed'));await editParagraph(p.block,p.text);if(getDocumentsState().editError)throw new Error(getDocumentsState().editError);},true),
  make('selectParagraph',empty,()=>selectAllInParagraph(),false,()=>!!getDocumentsState().caret),
  make('clearSelection',empty,()=>clearCaret(),false,()=>!!getDocumentsState().caret),
  make('panelUndo',empty,async()=>{await undoEdit();if(getDocumentsState().editError)throw new Error(getDocumentsState().editError);},true,()=>getDocumentsState().canUndo),
  make('panelRedo',empty,async()=>{await redoEdit();if(getDocumentsState().editError)throw new Error(getDocumentsState().editError);},true,()=>getDocumentsState().canRedo),
  make('setZoom',object({zoom:{type:'number',minimum:0.5,maximum:2}},['zoom']),(p:{zoom:number})=>patchDocuments({zoom:p.zoom})),
  make('goToPage',object({page:{type:'integer',minimum:1}},['page']),(p:{page:number})=>{if(p.page>getDocumentsState().pages)throw new Error(t('documents.panels.error.pageRange'));if(typeof document!=='undefined'){const page=document.querySelector(`[data-testid="documents-page"][data-page="${p.page}"]`);if(!page)throw new Error(t('documents.panels.error.noPage'));page.scrollIntoView({block:'start'});}}),
 ];
}
export function checkMatch(text:string,p:{start:number;end:number;expected:string}){const a=utf8ToUtf16Offset(text,p.start),b=utf8ToUtf16Offset(text,p.end);if(p.end<=p.start||utf16ToUtf8Offset(text,a)!==p.start||utf16ToUtf8Offset(text,b)!==p.end||text.slice(a,b)!==p.expected)throw new Error(t('documents.panels.error.matchChanged'));}
export function registerDocumentPanelCommands(){const offs=createDocumentPanelCommands().map(s=>registerCommandSpec(s));return()=>offs.forEach(f=>f());}
export async function runDocumentPanelCommand(id:string,params:unknown={}){await commandDispatcher.runCommand(id,params,{origin:'ui'});}
