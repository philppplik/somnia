import {STUDIO_POINTS,LIMITS,type PanelSlot,type StudioPointId} from './points';
import {emptyStudioContributions,type FormatClaim,type StudioContributions} from './contributions';
/** Pure registry of studio contributions. No DOM, no store: the host wires registerStudioContributions into activateExtensions and reads the resolvers from the Studio hosts. */
const entries=new Map<string,StudioContributions>();
export const qualify=(extId:string,id:string)=>`${extId}.${id}`;
export function registerStudioContributions(extId:string,c:StudioContributions):()=>void{
 if(entries.has(extId))throw new Error(`Studio contributions already registered for ${extId}`);
 entries.set(extId,c);return()=>{if(entries.get(extId)===c)entries.delete(extId);};
}
const all=()=>[...entries.entries()].sort(([a],[b])=>a<b?-1:a>b?1:0);
const extOf=(f:string)=>{const m=/\.([A-Za-z0-9]+)$/.exec(f);return m?m[1].toLowerCase():'';};
export interface ImporterCandidate{key:string;extId:string;label:string;priority:number;code:string}
/** Candidates for opening `fileName` in a Studio, best first. Built-in claims (priority 10) are the caller's business: when the Studio accepts the file itself, extension importers are only offered through "Open with". Ties break by extension id, so the order is stable. */
export function importersFor(studio:StudioPointId,fileName:string):ImporterCandidate[]{
 if(!STUDIO_POINTS[studio].mounted)return[];const ext=extOf(fileName);const out:ImporterCandidate[]=[];
 for(const [extId,c] of all())for(const i of c.importers)if(i.studio===studio){const claim=i.formats.find((f:FormatClaim)=>f.ext===ext);if(claim)out.push({key:qualify(extId,i.id),extId,label:i.label,priority:claim.priority,code:i.code});}
 return out.sort((a,b)=>b.priority-a.priority||(a.key<b.key?-1:1));
}
export interface ExporterEntry{key:string;extId:string;label:string;ext:string;mime:string;code:string}
export function exportersFor(studio:StudioPointId):ExporterEntry[]{
 if(!STUDIO_POINTS[studio].mounted)return[];
 return all().flatMap(([extId,c])=>c.exporters.filter(e=>e.studio===studio).map(e=>({key:qualify(extId,e.id),extId,label:e.label,ext:e.format.ext,mime:e.format.mime,code:e.code})));
}
export function sectionsFor(studio:StudioPointId,selectionKind:string){
 if(!STUDIO_POINTS[studio].mounted)return[];
 const hits=all().flatMap(([extId,c])=>c.inspectorSections.filter(s=>s.studio===studio&&s.when.includes(selectionKind)).map(s=>({...s,key:qualify(extId,s.id),extId})));
 return hits.sort((a,b)=>(a.order??50)-(b.order??50)||(a.key<b.key?-1:1)).slice(0,LIMITS.maxSectionsPerStudio);
}
export function commandsFor(studio:StudioPointId,selectionKind?:string){
 if(!STUDIO_POINTS[studio].mounted)return[];
 return all().flatMap(([,c])=>c.commands.filter(x=>x.studio.includes(studio)&&(!x.when||(selectionKind!==undefined&&x.when.includes(selectionKind)))).map(x=>({...x})));
}
export interface SlotLayout{slot:PanelSlot;shown:{key:string;title:string;extId:string;html:string}[];overflow:string[]}
/** Panels per host-owned slot, capped. Panels never touch rails, toolbox or canvas: a Studio without a slot (Photos has no rail slots) simply cannot receive one, and validation rejects the manifest. Overflow keys are listed, not mounted, so the host can offer them in a "More" menu. */
export function slotLayout(studio:StudioPointId):SlotLayout[]{
 const point=STUDIO_POINTS[studio];if(!point.mounted)return[];
 const panels=all().flatMap(([extId,c])=>c.panels.filter(p=>p.studio===studio).map(p=>({key:qualify(extId,p.id),title:p.title,extId,html:p.html,slot:p.slot})));
 return point.slots.map(slot=>{const inSlot=panels.filter(p=>p.slot===slot).sort((a,b)=>a.key<b.key?-1:1);return{slot,shown:inSlot.slice(0,LIMITS.maxSlotsPerSlot).map(({slot:_s,...p})=>p),overflow:inSlot.slice(LIMITS.maxSlotsPerSlot).map(p=>p.key)};}).filter(l=>l.shown.length||l.overflow.length);
}
export function resetStudioRegistry(){entries.clear();}
export {emptyStudioContributions};
