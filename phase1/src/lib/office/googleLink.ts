/** Google Drive shortcut files (.gdoc/.gsheet/.gslides) hold no document content, only a JSON pointer. */
export type GoogleKind='document'|'spreadsheet'|'presentation';
export interface GoogleLink{kind:GoogleKind;docId:string;url:string;/** Somnia format the user should export to. */exportAs:'docx'|'xlsx'|'pptx'}
const EXT:Record<string,GoogleKind>={gdoc:'document',gsheet:'spreadsheet',gslides:'presentation'};
const AS={document:'docx',spreadsheet:'xlsx',presentation:'pptx'} as const;
export const GOOGLE_LINK_FILE=/\.(gdoc|gsheet|gslides)$/i;
export function googleKindOfName(name:string):GoogleKind|undefined{const m=/\.(gdoc|gsheet|gslides)$/i.exec(name);return m?EXT[m[1]!.toLowerCase()]:undefined;}
/** Parses the pointer JSON. Returns undefined for anything that is not a well-formed docs.google.com link. */
export function parseGoogleLink(name:string,text:string):GoogleLink|undefined{
 const kind=googleKindOfName(name);if(!kind||text.length>64_000)return;
 let j:unknown;try{j=JSON.parse(text.replace(/^\uFEFF/,''));}catch{return;}
 if(!j||typeof j!=='object')return;const o=j as Record<string,unknown>;
 const id=typeof o.doc_id==='string'?o.doc_id:typeof o.resource_id==='string'?o.resource_id.replace(/^[a-z]+:/,''):'';
 if(!/^[A-Za-z0-9_-]{10,200}$/.test(id))return;
 const host={document:'document',spreadsheet:'spreadsheets',presentation:'presentation'}[kind];
 return{kind,docId:id,url:`https://docs.google.com/${host}/d/${id}/edit`,exportAs:AS[kind]};
}
export function googleLinkMessage(name:string):string{const k=googleKindOfName(name)??'document';
 return `${name} is a Google Drive shortcut, not the document itself. In Google ${k==='spreadsheet'?'Sheets':k==='presentation'?'Slides':'Docs'} choose File > Download > ${AS[k].toUpperCase()}, then open the downloaded file in Somnia.`;}
