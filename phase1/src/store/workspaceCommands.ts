import {registerCommandSpec} from '../lib/commandBridge';
import {textStudioLinks} from '../lib/workspace/smartLinks';
import {requestStudio} from './appStore';
import {getState} from './appStore';
import {getStudio} from '../lib/studios';
import {studioPanels,studioDefaultLayout} from '../lib/shell/codePanels';
import {dockLayout,updateDock} from './dockLayoutStore';
import {moveDock,cleanDock} from '../lib/workspace/docking';
import {popoutCode,canPopoutCode} from './workspacePopout';
const current=()=>{const studio=getStudio(getState().activeStudio),panels=studioPanels(studio),d=studioDefaultLayout(studio);return{studio,panels,defaults:{left:d.leftPanels,right:d.rightPanels}};};
export function registerWorkspaceCommands(){return [
 registerCommandSpec<{id:string;side:'left'|'right';index?:number},void>({id:'workspace.movePanel',title:'Move dock panel',category:'View',level:'ui',params:{type:'object',properties:{id:{type:'string'},side:{type:'string',enum:['left','right']},index:{type:'integer',minimum:0}},required:['id','side'],additionalProperties:false},run:({id,side,index})=>{const c=current();updateDock(c.studio.id,moveDock(dockLayout(c.studio.id,c.panels,c.defaults),id,side,index));}}),
 registerCommandSpec<{studio:string},void>({id:'workspace.openIn',title:'Open in Studio',category:'View',level:'ui',params:{type:'object',properties:{studio:{type:'string'}},required:['studio'],additionalProperties:false},run:({studio})=>{const s=getState();if(!textStudioLinks(s.activeFile,s.files[s.activeFile]??'').includes(studio))throw Error('No compatible editor');requestStudio(studio,'open',false,s.activeFile);}}),
 registerCommandSpec({id:'workspace.docking',title:'Tabbed panel docking',category:'View',level:'ui',enabled:()=>current().panels.length>0,run:()=>{const c=current(),d=dockLayout(c.studio.id,c.panels,c.defaults);updateDock(c.studio.id,{...d,enabled:!d.enabled});}}),
 registerCommandSpec({id:'workspace.resetDock',title:'Reset panel docking',category:'View',level:'ui',enabled:()=>current().panels.length>0,run:()=>{const c=current();updateDock(c.studio.id,{...cleanDock(undefined,c.panels,c.defaults),enabled:true});}}),
 registerCommandSpec({id:'workspace.popout',title:'Open Code in a new window',category:'View',level:'ui',enabled:canPopoutCode,run:popoutCode})
 ];}
