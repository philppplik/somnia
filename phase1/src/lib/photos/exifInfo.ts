/** Quick photo info read from the file bytes: dimensions plus the daily EXIF set (camera, lens, exposure, aperture, ISO, focal length, date). Dependency-free mini parser: JPEG markers (SOF + APP1 EXIF) and PNG (IHDR + eXIf chunk) with a small TIFF reader. Best effort - anything unreadable just stays absent, the original bytes are only read. */
export interface PhotoInfo{width?:number;height?:number;camera?:string;lens?:string;exposure?:string;aperture?:string;iso?:number;focalLength?:string;dateTime?:string;}
type Ifd=Record<number,{type:number;count:number;value:number|number[]|string}>;
const TYPE_SIZE:Record<number,number>={1:1,2:1,3:2,4:4,5:8,7:1,9:4,10:8};
function parseTiff(dv:DataView,off:number):{ifd0:Ifd;exif:Ifd}|null{
 try{
  const le=dv.getUint16(off)===0x4949;
  if(!le&&dv.getUint16(off)!==0x4d4d)return null;
  if(dv.getUint16(off+2,le)!==42)return null;
  const u16=(p:number)=>dv.getUint16(p,le),u32=(p:number)=>dv.getUint32(p,le);
  const readIfd=(at:number):Ifd=>{
   const out:Ifd={};
   if(at<=0||at+2>dv.byteLength)return out;
   const n=u16(at);
   for(let i=0;i<n;i++){
    const e=at+2+i*12;if(e+12>dv.byteLength)break;
    const tag=u16(e),type=u16(e+2),count=u32(e+4),size=(TYPE_SIZE[type]??1)*count;
    const dataOff=size<=4?e+8:off+u32(e+8);
    try{
     if(type===2){
      let str='';for(let k=0;k<count&&dataOff+k<dv.byteLength;k++){const c=dv.getUint8(dataOff+k);if(c===0)break;str+=String.fromCharCode(c);}
      out[tag]={type,count,value:str.trim()};
     }else if(type===3){out[tag]={type,count,value:count===1?u16(dataOff):Array.from({length:Math.min(count,16)},(_,k)=>u16(dataOff+k*2))};}
     else if(type===4||type===9){out[tag]={type,count,value:count===1?u32(dataOff):Array.from({length:Math.min(count,16)},(_,k)=>u32(dataOff+k*4))};}
     else if(type===5){out[tag]={type,count,value:Array.from({length:Math.min(count,8)},(_,k)=>u32(dataOff+k*8)/Math.max(1,u32(dataOff+k*8+4)))};}
    }catch{/* skip entry */}
   }
   return out;
  };
  const ifd0=readIfd(off+u32(off+4));
  const exifPtr=ifd0[0x8769];
  return{ifd0,exif:exifPtr&&typeof exifPtr.value==='number'?readIfd(off+exifPtr.value):{}};
 }catch{return null;}
}
const str=(v:unknown):string|undefined=>typeof v==='string'&&v?v:undefined;
const num=(v:unknown):number|undefined=>typeof v==='number'&&Number.isFinite(v)?v:Array.isArray(v)&&typeof v[0]==='number'?v[0]:undefined;
function fromTiff(t:{ifd0:Ifd;exif:Ifd},info:PhotoInfo){
 const make=str(t.ifd0[0x010f]?.value),model=str(t.ifd0[0x0110]?.value);
 info.camera=[make,model].filter(Boolean).join(' ').replace(/\s+/g,' ').trim()||undefined;
 if(model&&make&&model.toLowerCase().startsWith(make.toLowerCase()))info.camera=model; // "Canon Canon EOS" -> "Canon EOS"
 info.width=num(t.ifd0[0x0100]?.value)??info.width;
 info.height=num(t.ifd0[0x0101]?.value)??info.height;
 info.lens=str(t.exif[0xa405]?.value)??str(t.exif[0xa434]?.value);
 const et=num(t.exif[0x829a]?.value);
 if(et)info.exposure=et>=1?`${Math.round(et*10)/10} s`:`1/${Math.round(1/et)} s`;
 const fn=num(t.exif[0x829d]?.value);
 if(fn)info.aperture=`f/${Math.round(fn*10)/10}`;
 info.iso=num(t.exif[0x8827]?.value)??undefined;
 const fl=num(t.exif[0x920a]?.value);
 if(fl)info.focalLength=`${Math.round(fl*10)/10} mm`;
 info.dateTime=str(t.exif[0x9003]?.value)??str(t.ifd0[0x0132]?.value);
}
function parseJpeg(dv:DataView):PhotoInfo{
 const info:PhotoInfo={};
 let p=2; // after SOI
 while(p+4<=dv.byteLength){
  if(dv.getUint8(p)!==0xff)break;
  const marker=dv.getUint8(p+1),len=dv.getUint16(p+2);
  if(marker===0xda)break; // scan data starts
  if((marker>=0xc0&&marker<=0xc3)||(marker>=0xc5&&marker<=0xc7)){info.height=dv.getUint16(p+5);info.width=dv.getUint16(p+7);}
  if(marker===0xe1&&len>10){
   const sig=String.fromCharCode(dv.getUint8(p+4),dv.getUint8(p+5),dv.getUint8(p+6),dv.getUint8(p+7));
   if(sig==='Exif'){const t=parseTiff(dv,p+10);if(t)fromTiff(t,info);}
  }
  p+=2+len;
 }
 return info;
}
function parsePng(dv:DataView):PhotoInfo{
 const info:PhotoInfo={width:dv.getUint32(16),height:dv.getUint32(20)}; // IHDR right after the signature+length+type
 let p=8;
 while(p+12<=dv.byteLength){
  const len=dv.getUint32(p),type=String.fromCharCode(dv.getUint8(p+4),dv.getUint8(p+5),dv.getUint8(p+6),dv.getUint8(p+7));
  if(type==='eXIf'&&len>=4){const t=parseTiff(dv,p+8);if(t)fromTiff(t,info);}
  if(type==='IDAT')break;
  p+=12+len;
 }
 return info;
}
/** Reads dimensions and EXIF from raw file bytes; mime decides the container path. Never throws. */
export function readPhotoInfo(_mime:string,buf:ArrayBuffer):PhotoInfo{
 try{
  const dv=new DataView(buf);
  if(dv.byteLength>=4&&dv.getUint16(0)===0xffd8)return parseJpeg(dv);
  if(dv.byteLength>=24&&dv.getUint32(0)===0x89504e47)return parsePng(dv);
 }catch{/* best effort */}
 return {};
}
/** One compact line per present field, ordered the way photographers scan them. */
export function photoInfoLines(info:PhotoInfo):{key:string;value:string}[]{
 const out:{key:string;value:string}[]=[];
 if(info.width&&info.height)out.push({key:'dimensions',value:`${info.width} × ${info.height} px`});
 if(info.camera)out.push({key:'camera',value:info.camera});
 if(info.lens)out.push({key:'lens',value:info.lens});
 const exp=[info.exposure,info.aperture,info.iso!=null?`ISO ${info.iso}`:undefined,info.focalLength].filter(Boolean).join(' · ');
 if(exp)out.push({key:'exposure',value:exp});
 if(info.dateTime)out.push({key:'date',value:info.dateTime});
 return out;
}
export function formatBytes(n:number):string{
 if(n>=1024*1024)return `${Math.round(n/104857.6)/10} MB`;
 if(n>=1024)return `${Math.round(n/102.4)/10} KB`;
 return `${n} B`;
}
