import {LIMITS,type InterchangeKind} from './points';
/** Interchange models: the minimum a Studio needs to build or snapshot a document. Deliberately small, versioned with apiVersion; richer fidelity (styles, formulas, masks) arrives as optional fields later. */
export type Cell=string|number|boolean|null;
export type InterchangeModel=
 |{kind:'files';files:Record<string,string>}
 |{kind:'blocks';blocks:{type:'paragraph'|'heading';text:string;level?:number}[]}
 |{kind:'cells';sheets:{name:string;rows:Cell[][]}[]}
 |{kind:'slides';slides:{shapes:{type:'text';text:string}[]}[]}
 |{kind:'pcm';sampleRate:number;channels:Float32Array[]}
 |{kind:'raster';width:number;height:number;data:Uint8ClampedArray};
const obj=(v:unknown):v is Record<string,unknown>=>typeof v==='object'&&v!==null&&!Array.isArray(v);
/** Validates what an importer returned. Anything outside the shape or the caps is rejected whole; nothing is repaired. */
export function validateInterchange(kind:InterchangeKind,m:unknown):{ok:true;model:InterchangeModel}|{ok:false;error:string}{
 const bad=(error:string)=>({ok:false as const,error});if(!obj(m)||m.kind!==kind)return bad(`Expected an interchange model of kind "${kind}".`);
 switch(kind){
  case 'files':{if(!obj(m.files))return bad('files must be an object.');const e=Object.entries(m.files);if(e.length>2000||e.some(([k,v])=>typeof v!=='string'||k.startsWith('/')||k.includes('..')||k.includes('\\')))return bad('files must map relative paths to strings (max 2000).');return{ok:true,model:m as InterchangeModel};}
  case 'blocks':return Array.isArray(m.blocks)&&m.blocks.length<=100000&&m.blocks.every(b=>obj(b)&&(b.type==='paragraph'||b.type==='heading')&&typeof b.text==='string')?{ok:true,model:m as InterchangeModel}:bad('blocks must be paragraphs or headings with text.');
  case 'cells':return Array.isArray(m.sheets)&&m.sheets.length<=256&&m.sheets.every(s=>obj(s)&&typeof s.name==='string'&&Array.isArray(s.rows)&&s.rows.length<=1048576&&s.rows.every(r=>Array.isArray(r)&&r.length<=16384&&r.every(c=>c===null||['string','number','boolean'].includes(typeof c))))?{ok:true,model:m as InterchangeModel}:bad('cells must be sheets of rows with string, number, boolean or null values.');
  case 'slides':return Array.isArray(m.slides)&&m.slides.length<=2000&&m.slides.every(s=>obj(s)&&Array.isArray(s.shapes)&&s.shapes.every(x=>obj(x)&&x.type==='text'&&typeof x.text==='string'))?{ok:true,model:m as InterchangeModel}:bad('slides must contain text shapes.');
  case 'pcm':{const ch=m.channels;if(typeof m.sampleRate!=='number'||m.sampleRate<8000||m.sampleRate>384000||!Array.isArray(ch)||!ch.length||ch.length>8||!ch.every(c=>c instanceof Float32Array&&c.length===(ch[0] as Float32Array).length))return bad('pcm needs sampleRate 8000-384000 and 1-8 equal-length Float32Array channels.');return ch.reduce((n:number,c:Float32Array)=>n+c.byteLength,0)>LIMITS.maxBytesOut?bad('pcm is too large.'):{ok:true,model:m as InterchangeModel};}
  case 'raster':return typeof m.width==='number'&&typeof m.height==='number'&&Number.isInteger(m.width)&&Number.isInteger(m.height)&&m.width>0&&m.height>0&&m.width*m.height<=100_000_000&&m.data instanceof Uint8ClampedArray&&m.data.length===m.width*m.height*4?{ok:true,model:m as InterchangeModel}:bad('raster needs integer width/height (max 100 MP) and RGBA data of matching length.');
 }
}
