import {listZip,sniffOffice,MAX_OFFICE_BYTES} from '../office/zipProbe';
export interface DocxInspection{ok:boolean;error?:string;risks:RiskId[]}
/** Parts the engine reads without a full editor model. Saving can drop them, so the host warns before any export. */
export type RiskId='charts'|'embedded'|'macros'|'comments'|'notes'|'images'|'headers'|'smartart'|'encrypted';
const RULES:[RiskId,RegExp][]=[['charts',/^word\/charts\//],['smartart',/^word\/diagrams\//],['embedded',/^word\/(embeddings|activeX)\//],['macros',/vbaProject\.bin$/],['comments',/^word\/comments/],['notes',/^word\/(footnotes|endnotes)\.xml$/],['images',/^word\/media\//],['headers',/^word\/(header|footer)\d*\.xml$/]];
/** Reads only the ZIP directory. Never inflates. */
export function inspectDocx(bytes:Uint8Array):DocxInspection{
 if(bytes.length>MAX_OFFICE_BYTES)return{ok:false,error:'DOCX is larger than 25 MB.',risks:[]};
 if(sniffOffice(bytes)!=='docx')return{ok:false,error:'This is not a valid DOCX file.',risks:[]};
 let entries;try{entries=listZip(bytes);}catch(e){return{ok:false,error:e instanceof Error?e.message:String(e),risks:[]};}
 if(entries.some(e=>e.encrypted))return{ok:false,error:'Encrypted DOCX files are not supported.',risks:['encrypted']};
 const risks=RULES.filter(([,re])=>entries.some(e=>re.test(e.name))).map(([id])=>id);
 return{ok:true,risks};
}
