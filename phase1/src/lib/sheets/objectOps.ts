import type {ImageObject,ObjectOp,ObjectsInfo,PictureOp,ShapeObject} from './protocol';
/** Pictures and shapes on a sheet: validation of untrusted command input and drawing of shapes. The Rust bridge and the engine re-validate every field. */
export const SHAPES=['rectangle','roundedRectangle','ellipse','triangle','line','arrow','textBox'] as const;
export const SHAPE_FILLS=['blue','green','orange','red','grey','yellow','white','none'] as const;
export const SHAPE_LINES=['blue','green','orange','red','grey','black','none'] as const;
export const MAX_PICTURE_BYTES=10*1024*1024,MAX_PICTURE_BASE64=Math.ceil(MAX_PICTURE_BYTES/3)*4,MAX_OBJECTS=200,MAX_SHAPE_TEXT=200,MAX_ALT=255,MIN_PICTURE_WIDTH=16,MAX_OBJECT_SIZE=4000;
const control=(v:string,keepNewline=false)=>(keepNewline?/[\u0000-\u0009\u000b-\u001f\u007f]/:/[\u0000-\u001f\u007f]/).test(v);
const oneOf=<T extends string>(list:readonly T[],v:unknown,what:string):T=>{if(typeof v!=='string'||!(list as readonly string[]).includes(v))throw Error(`Unsupported ${what}.`);return v as T;};
const size=(v:unknown,what:string,min:number)=>{if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>MAX_OBJECT_SIZE)throw Error(`${what} must be ${min} to ${MAX_OBJECT_SIZE} points.`);return v;};
export function parseObjectCommand(input:unknown):ObjectOp{
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Object operation must be an object.');
 const o=input as Record<string,unknown>,only=(...k:string[])=>{if(Object.keys(o).some(x=>!k.includes(x)))throw Error('Unknown object field.');};
 const id=()=>{if(typeof o.id!=='number'||!Number.isInteger(o.id)||o.id<0||o.id>0xffffffff)throw Error('Invalid object id.');return o.id;};
 const object=()=>oneOf(['image','shape'] as const,o.object,'object');
 switch(o.kind){
  case 'shape':{only('kind','shape','fill','line','width','height','text');const shape=oneOf(SHAPES,o.shape,'shape');const out:ObjectOp={kind:'shape',shape};
   if(o.fill!==undefined)out.fill=oneOf(SHAPE_FILLS,o.fill,'fill');if(o.line!==undefined)out.line=oneOf(SHAPE_LINES,o.line,'line color');
   if(o.width!==undefined)out.width=size(o.width,'The width',8);
   if(o.height!==undefined)out.height=size(o.height,'The height',shape==='line'||shape==='arrow'?0:8);
   if(o.text!==undefined){if(typeof o.text!=='string'||[...o.text].length>MAX_SHAPE_TEXT||control(o.text,true))throw Error('The text is too long or has control characters.');if(shape!=='textBox'&&o.text!=='')throw Error('Only text boxes hold text.');out.text=o.text;}
   return out;}
  case 'move':{only('kind','object','id','width','height','here');const out:ObjectOp={kind:'move',object:object(),id:id()};
   if(o.width!==undefined)out.width=size(o.width,'The width',1);if(o.height!==undefined)out.height=size(o.height,'The height',0);
   if(o.here!==undefined){if(typeof o.here!=='boolean')throw Error('`here` must be true or false.');out.here=o.here;}
   if(out.width===undefined&&out.height===undefined&&!out.here)throw Error('Nothing to change.');return out;}
  case 'place':{only('kind','object','id','row','col','dx','dy','width','height');
   const cell=(v:unknown,max:number,what:string)=>{if(typeof v!=='number'||!Number.isInteger(v)||v<0||v>=max)throw Error(`The ${what} is out of range.`);return v;};
   const off=(v:unknown,what:string)=>{if(typeof v!=='number'||!Number.isFinite(v)||v<0||v>100_000)throw Error(`The ${what} offset must be 0 to 100,000 points.`);return v;};
   const out:ObjectOp={kind:'place',object:object(),id:id(),row:cell(o.row,1_048_576,'row'),col:cell(o.col,16_384,'column'),dx:off(o.dx,'horizontal'),dy:off(o.dy,'vertical')};
   if(o.width!==undefined)out.width=size(o.width,'The width',1);if(o.height!==undefined)out.height=size(o.height,'The height',0);return out;}
  case 'order':{only('kind','object','id','to');return {kind:'order',object:object(),id:id(),to:oneOf(['front','forward','backward','back'] as const,o.to,'stacking order')};}
  case 'turn':only('kind','id');return {kind:'turn',id:id()};
  case 'delete':only('kind','object','id');return {kind:'delete',object:object(),id:id()};
  default:throw Error('Unsupported object operation.');
 }
}
/** Decodes a base64 picture, checks size and the PNG or JPEG signature. The bridge checks again. */
export function decodePicture(input:unknown):{bytes:Uint8Array;alt:string;width:number}{
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Picture must be an object.');
 const o=input as Record<string,unknown>;if(Object.keys(o).some(k=>!['base64','alt','width'].includes(k)))throw Error('Unknown picture field.');
 const b=o.base64;if(typeof b!=='string'||b.length<8||b.length>MAX_PICTURE_BASE64||!/^[A-Za-z0-9+/]+={0,2}$/.test(b)||b.length%4!==0)throw Error('The picture data is not valid base64 or is larger than 10 MB.');
 let bin:string;try{bin=atob(b);}catch{throw Error('The picture data is not valid base64.');}
 if(bin.length>MAX_PICTURE_BYTES)throw Error('A picture can be at most 10 MB.');
 const bytes=Uint8Array.from(bin,c=>c.charCodeAt(0));
 if(!isPictureBytes(bytes))throw Error('Only PNG and JPEG pictures can be inserted.');
 let alt='';if(o.alt!==undefined){if(typeof o.alt!=='string'||[...o.alt].length>MAX_ALT||control(o.alt))throw Error('The description is too long or has control characters.');alt=o.alt;}
 let width=0;if(o.width!==undefined){if(typeof o.width!=='number'||!Number.isFinite(o.width)||o.width<MIN_PICTURE_WIDTH||o.width>2000)throw Error('The width must be 16 to 2,000 points.');width=o.width;}
 return {bytes,alt,width};
}
export const isPictureBytes=(b:Uint8Array)=>(b.length>=24&&b[0]===0x89&&b[1]===0x50&&b[2]===0x4e&&b[3]===0x47)||(b.length>=4&&b[0]===0xff&&b[1]===0xd8);
export function bytesToBase64(bytes:Uint8Array):string{let s='';for(let i=0;i<bytes.length;i+=0x8000)s+=String.fromCharCode(...bytes.subarray(i,i+0x8000));return btoa(s);}
const HEX=/^#[0-9A-Fa-f]{6}$/,num=(v:unknown,max=1e7)=>typeof v==='number'&&Number.isFinite(v)?Math.max(-max,Math.min(max,v)):0;
const str=(v:unknown,n:number)=>typeof v==='string'?v.slice(0,n):'';
export function parseObjects(raw:unknown):ObjectsInfo{
 const r=raw as {images?:unknown;shapes?:unknown}|null;const arr=(v:unknown)=>Array.isArray(v)?v.slice(0,MAX_OBJECTS):[];
 const base=(x:Record<string,unknown>)=>({id:num(x.id,0xffffffff),row:num(x.row),col:num(x.col),dx:num(x.dx),dy:num(x.dy),width:Math.max(0,num(x.width,MAX_OBJECT_SIZE)),height:Math.max(0,num(x.height,MAX_OBJECT_SIZE))});
 const images:ImageObject[]=arr(r?.images).flatMap(i=>{const x=i as Record<string,unknown>|null;return x&&typeof x==='object'?[{...base(x),mime:str(x.mime,40),alt:str(x.alt,MAX_ALT),bytes:num(x.bytes,1e9)}]:[];});
 const shapes:ShapeObject[]=arr(r?.shapes).flatMap(i=>{const x=i as Record<string,unknown>|null;return x&&typeof x==='object'?[{...base(x),kind:str(x.kind,24),fill:typeof x.fill==='string'&&HEX.test(x.fill)?x.fill:null,line:typeof x.line==='string'&&HEX.test(x.line)?x.line:null,text:str(x.text,MAX_SHAPE_TEXT*4)}]:[];});
 return {images,shapes};
}
const esc=(t:string)=>t.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c] as string));
const f1=(n:number)=>String(Math.round(n*10)/10);
/** Greedy word wrap by an estimated glyph width, at most 40 lines. */
export function wrapShapeText(text:string,width:number,perChar=6.6):string[]{
 const cap=Math.max(1,Math.floor(width/perChar)),lines:string[]=[];
 for(const para of text.split('\n')){let cur='';for(const word of para.split(' ')){let w=word;while([...w].length>cap){if(cur){lines.push(cur);cur='';}lines.push([...w].slice(0,cap).join(''));w=[...w].slice(cap).join('');}
  const next=cur?cur+' '+w:w;if([...next].length>cap&&cur){lines.push(cur);cur=w;}else cur=next;}lines.push(cur);if(lines.length>=40)break;}
 return lines.slice(0,40);
}
/** A shape as a standalone SVG document in points (text escaped, colors validated). Null for kinds that are not drawn. */
export function shapeSvg(s:ShapeObject):string|null{
 const line=s.kind==='Line'||s.kind==='Arrow',w=Math.max(s.width,2),h=line?Math.max(s.height,2):Math.max(s.height,2);
 const fill=s.fill&&!line?s.fill:'none',stroke=s.line??'none',sw=1.5,i=sw/2;let body='';
 const paint=` fill="${fill}" stroke="${stroke}" stroke-width="${sw}"`;
 switch(s.kind){
  case 'Rectangle':case 'TextBox':body=`<rect x="${i}" y="${i}" width="${f1(w-sw)}" height="${f1(h-sw)}"${paint}/>`;break;
  case 'RoundedRectangle':body=`<rect x="${i}" y="${i}" width="${f1(w-sw)}" height="${f1(h-sw)}" rx="${f1(Math.min(w,h)*0.18)}"${paint}/>`;break;
  case 'Ellipse':body=`<ellipse cx="${f1(w/2)}" cy="${f1(h/2)}" rx="${f1(w/2-i)}" ry="${f1(h/2-i)}"${paint}/>`;break;
  case 'Triangle':body=`<polygon points="${f1(w/2)},${i} ${f1(w-i)},${f1(h-i)} ${i},${f1(h-i)}"${paint}/>`;break;
  case 'Line':case 'Arrow':{const y=s.height<=2?h/2:h-i,c=s.line??'#1F2328';body=`<line x1="${i}" y1="${s.height<=2?f1(h/2):i}" x2="${f1(w-i)}" y2="${f1(y)}" stroke="${c}" stroke-width="${sw}"/>`;
   if(s.kind==='Arrow'){const ex=w-i,ey=y,ang=Math.atan2(ey-(s.height<=2?h/2:i),ex-i),a=0.45,l=9;body+=`<polygon points="${f1(ex)},${f1(ey)} ${f1(ex-l*Math.cos(ang-a))},${f1(ey-l*Math.sin(ang-a))} ${f1(ex-l*Math.cos(ang+a))},${f1(ey-l*Math.sin(ang+a))}" fill="${c}"/>`;}
   break;}
  default:return null;
 }
 if(s.kind==='TextBox'&&s.text){const lines=wrapShapeText(s.text,w-8);body+=lines.filter((_,k)=>4+(k+1)*14<=h+14).map((t,k)=>`<text x="4" y="${4+(k+1)*14-3}" font-family="sans-serif" font-size="12" fill="#1F2328">${esc(t)}</text>`).join('');}
 return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${f1(w)} ${f1(h)}" width="${f1(w)}" height="${f1(h)}">${body}</svg>`;
}
export const pictureDataUrl=(mime:string,base64:string)=>(mime==='image/png'||mime==='image/jpeg')&&/^[A-Za-z0-9+/]+={0,2}$/.test(base64)?`data:${mime};base64,${base64}`:null;
/** The panel's single action choice. */
export const OBJECT_ACTIONS=['picture','rectangle','roundedRectangle','ellipse','triangle','line','arrow','textBox','move','resize','front','forward','backward','back','turn','delete'] as const;
export type ObjectAction=typeof OBJECT_ACTIONS[number];
export const OBJECT_GROUPS:readonly (readonly [string,readonly ObjectAction[]])[]=[['picture',['picture']],['shapes',['rectangle','roundedRectangle','ellipse','triangle','line','arrow','textBox']],['object',['move','resize','delete']],['order',['front','forward','backward','back','turn']]];
export const objectIsShape=(a:ObjectAction)=>(SHAPES as readonly string[]).includes(a);
export const objectNeedsPick=(a:ObjectAction)=>a==='move'||a==='resize'||a==='delete'||a==='front'||a==='forward'||a==='backward'||a==='back'||a==='turn';
export interface ObjectFields{fill:string;line:string;text:string;width:string;height:string;pick:string}
/** Builds the op for shapes and object changes; null while the inputs are incomplete or invalid. `pick` is `image:3` or `shape:4`. */
export function buildObjectOp(a:ObjectAction,f:ObjectFields):ObjectOp|null{
 const n=(v:string)=>v.trim()===''?undefined:Number(v.trim().replace(/,/g,'.'));
 try{
  if(objectIsShape(a)){const w=n(f.width),h=n(f.height);return parseObjectCommand({kind:'shape',shape:a,fill:f.fill||undefined,line:f.line||undefined,...(w!==undefined?{width:w}:{}),...(h!==undefined?{height:h}:{}),...(a==='textBox'&&f.text!==''?{text:f.text}:{})});}
  const m=/^(image|shape):(\d{1,10})$/.exec(f.pick);if(!m)return null;const id=Number(m[2]);
  if(a==='delete')return parseObjectCommand({kind:'delete',object:m[1],id});
  if(a==='front'||a==='forward'||a==='backward'||a==='back')return parseObjectCommand({kind:'order',object:m[1],id,to:a});
  if(a==='turn')return m[1]==='shape'?parseObjectCommand({kind:'turn',id}):null;
  if(a==='move')return parseObjectCommand({kind:'move',object:m[1],id,here:true});
  const w=n(f.width),h=n(f.height);return parseObjectCommand({kind:'move',object:m[1],id,...(w!==undefined?{width:w}:{}),...(h!==undefined?{height:h}:{})});
 }catch{return null;}
}
export type {PictureOp};
