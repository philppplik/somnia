import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {Check,Sparkles,Lightbulb,Zap,Flag,Tag,Info,CircleAlert,AlertTriangle,Lock,Eye,Play,Pause,Camera,Image,MessageSquare,Search,Settings,Layers,Palette,Monitor,Puzzle,ArrowRight,ChevronsUpDown,type VadivamIcon} from '../icons';

/** Curated icon picker for slides: keys double as i18n suffixes (`slides.icon.<key>`) and alt-text stems. */
export const SLIDE_ICONS:readonly {key:string;Icon:VadivamIcon}[]=[
 {key:'check',Icon:Check},{key:'sparkles',Icon:Sparkles},{key:'lightbulb',Icon:Lightbulb},{key:'zap',Icon:Zap},
 {key:'flag',Icon:Flag},{key:'tag',Icon:Tag},{key:'info',Icon:Info},{key:'notice',Icon:CircleAlert},
 {key:'warning',Icon:AlertTriangle},{key:'lock',Icon:Lock},{key:'eye',Icon:Eye},{key:'play',Icon:Play},
 {key:'pause',Icon:Pause},{key:'camera',Icon:Camera},{key:'image',Icon:Image},{key:'comment',Icon:MessageSquare},
 {key:'search',Icon:Search},{key:'settings',Icon:Settings},{key:'layers',Icon:Layers},{key:'palette',Icon:Palette},
 {key:'monitor',Icon:Monitor},{key:'puzzle',Icon:Puzzle},{key:'arrowRight',Icon:ArrowRight},{key:'steps',Icon:ChevronsUpDown},
];

/** Exported icon edge in pixels: large enough to stay crisp at typical slide sizes, small enough to stay a few KiB. */
export const SLIDE_ICON_PX=256;
/** Default stroke color (6-hex, no #): a neutral near-black that reads on light and dark backgrounds. */
export const SLIDE_ICON_COLOR='1f2937';

const catalog=(key:string)=>{const e=SLIDE_ICONS.find(x=>x.key===key);if(!e)throw Error(`Unknown icon "${key}"`);return e;};

/** Standalone SVG markup for a catalog icon: colored stroke, explicit size, safe to rasterize off-DOM. */
export function slideIconSvg(key:string,color:string=SLIDE_ICON_COLOR,size:number=SLIDE_ICON_PX):string{
 if(!/^[0-9a-fA-F]{6}$/.test(color))throw Error('Icon color must be 6 hex digits');
 if(!Number.isInteger(size)||size<16||size>2048)throw Error('Icon size must be 16 to 2048 pixels');
 return renderToStaticMarkup(createElement(catalog(key).Icon,{size,strokeWidth:2,color:`#${color}`}));
}

/** Rasterize a catalog icon to PNG bytes for picture insertion. Needs a DOM canvas; throws a clear error otherwise. */
export async function slideIconPng(key:string,color:string=SLIDE_ICON_COLOR,size:number=SLIDE_ICON_PX):Promise<Uint8Array>{
 const svg=slideIconSvg(key,color,size);
 if(typeof document==='undefined')throw Error('Icon rasterization needs a browser canvas');
 const url=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml;charset=utf-8'}));
 try{
  const image=await new Promise<HTMLImageElement>((resolve,reject)=>{
   const img=new window.Image();
   img.onload=()=>resolve(img);img.onerror=()=>reject(Error('The icon could not be rasterized'));
   img.src=url;
  });
  const canvas=document.createElement('canvas');canvas.width=size;canvas.height=size;
  const ctx=canvas.getContext('2d');if(!ctx)throw Error('Icon rasterization needs a 2D canvas');
  ctx.drawImage(image,0,0,size,size);
  const blob=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,'image/png'));
  if(!blob)throw Error('The icon could not be encoded as PNG');
  return new Uint8Array(await blob.arrayBuffer());
 }finally{URL.revokeObjectURL(url);}
}
