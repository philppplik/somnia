import {useSyncExternalStore} from 'react';
import type {CollabEngine,CollabSnapshot} from './types';
import {RealEngine} from './realEngine';
import {appMedia} from './appMedia';
import {appProject,canJoinHere,hostFilesReady} from './appProject';
/** The active engine: the real one. Tests and the desktop shell may replace it with setCollabEngine(). */
let engine:CollabEngine=new RealEngine({project:appProject,media:appMedia,hasFiles:hostFilesReady,canJoin:canJoinHere});
const listeners=new Set<()=>void>();let off:(()=>void)|null=null;
const wire=()=>{off?.();off=engine.subscribe(()=>listeners.forEach(l=>l()));};wire();
export const setCollabEngine=(e:CollabEngine)=>{engine=e;wire();listeners.forEach(l=>l());};
export const getCollabEngine=()=>engine;
export const useCollab=():CollabSnapshot=>useSyncExternalStore(l=>{listeners.add(l);return()=>{listeners.delete(l);};},()=>engine.snapshot());
/** UI-only state: which dialog is open and on which tab. */
export type ShareTab='host'|'join';
let ui={open:false,tab:'host' as ShareTab};const uiL=new Set<()=>void>();
export const openShare=(tab:ShareTab)=>{ui={open:true,tab};uiL.forEach(l=>l());};
export const setShareTab=(tab:ShareTab)=>{ui={...ui,tab};uiL.forEach(l=>l());};
export const closeShare=()=>{ui={...ui,open:false};uiL.forEach(l=>l());};
export const useShareUi=()=>useSyncExternalStore(l=>{uiL.add(l);return()=>{uiL.delete(l);};},()=>ui);
