/** Store-owned integration port. Low-level editor actions never import the application store. */
export interface CodeEditorSnapshot {activeStudio:string;activeFile:string;coreConnected:boolean;files:Readonly<Record<string,string>>}
export interface CodeEditorHost {
 read:()=>CodeEditorSnapshot;
 generation:()=>number;
 reveal:(file:string,span:{from:number;to:number;raw:string})=>boolean;
 revealPosition?:(file:string,position:{raw:string;line:number;column:number})=>boolean;
 notice:(text:string)=>void;
}
const unavailable:CodeEditorHost={read:()=>({activeStudio:'',activeFile:'',coreConnected:false,files:{}}),generation:()=>-1,reveal:()=>false,notice:()=>{}};
let host:CodeEditorHost=unavailable;
export const getCodeEditorHost=()=>host;
/** App/store owner installs the adapter; disposal cannot remove a newer owner. */
export function installCodeEditorHost(next:CodeEditorHost){const previous=host;host=next;return()=>{if(host===next)host=previous;};}
