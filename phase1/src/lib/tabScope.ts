/** Pure rules for which open tabs belong to which Studio. A tab is shown only in the Studio that owns it. */
export type TabStudioMap=Readonly<Record<string,string>>;
export const DEFAULT_TAB_STUDIO='code';
/** Source files are keyed by their path in studioByTab. A file nobody routed elsewhere belongs to Code. */
export const fileTabStudio=(file:string,byTab:TabStudioMap):string=>byTab[file]??DEFAULT_TAB_STUDIO;
/** Media tabs are keyed 'media:<name>'. `fallback` supplies the kind's own Studio when none was recorded. */
export const mediaTabStudio=(name:string,byTab:TabStudioMap,fallback?:()=>string|null):string=>byTab['media:'+name]??fallback?.()??DEFAULT_TAB_STUDIO;
export const scopedFiles=(files:readonly string[],studio:string,byTab:TabStudioMap):string[]=>files.filter(f=>fileTabStudio(f,byTab)===studio);
/** After closing `closed`, the tab to activate: the left neighbour inside the same Studio, else the right one, else none. Never crosses Studios. */
export function neighbourAfterClose(files:readonly string[],closed:string,studio:string,byTab:TabStudioMap):string|null{
 const scoped=scopedFiles(files,studio,byTab);const i=scoped.indexOf(closed);const rest=scoped.filter(f=>f!==closed);
 if(!rest.length)return null;return rest[Math.max(0,i-1)];
}
/** Next/previous tab inside one Studio (wraps). */
export function cycleScoped(files:readonly string[],active:string,studio:string,byTab:TabStudioMap,step:number):string|null{
 const s=scopedFiles(files,studio,byTab);if(s.length<2)return null;const i=s.indexOf(active);return s[(i+step+s.length)%s.length];
}
