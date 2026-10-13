export function loopbackPreviewUrl(raw:string):URL{
 const url=new URL(raw);if(url.protocol!=='http:'||url.hostname!=='127.0.0.1'||url.username||url.password||!url.port||Number(url.port)<1024||Number(url.port)>65535)throw Error('frameworks.unsafePreview');return url;
}
export function frameworkSourceLocation(value:unknown):{file:string;line:number}|null{
 if(typeof value!=='string'||value.length>1024)return null;const m=/^([^:\\]+):(\d+)$/.exec(value);if(!m||m[1].startsWith('/')||m[1].split('/').some(p=>!p||p==='.'||p==='..')||/[\x00-\x1f]/.test(m[1]))return null;
 const line=Number(m[2]);return Number.isSafeInteger(line)&&line>0&&line<1_000_000?{file:m[1],line}:null;
}
/** Exact origin plus WindowProxy identity are both required, never trust message content alone. */
export function acceptFrameworkSource(event:Pick<MessageEvent,'origin'|'source'|'data'>,frame:Window|null,url:string,files:Readonly<Record<string,string>>){
 if(!frame||event.source!==frame||event.origin!==loopbackPreviewUrl(url).origin||event.data?.somnia!=='framework-source')return null;
 const loc=frameworkSourceLocation(event.data.source);return loc&&Object.hasOwn(files,loc.file)?loc:null;
}
