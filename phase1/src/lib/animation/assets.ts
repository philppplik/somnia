import {prepareRasterAsset} from '../interface/assets';
import {parseInterfaceSVG} from '../interface/vector';
import {pathData,validateInterfaceVectors} from '../interface/vectorCore';
import {checkImageDimensions} from '../interface/assetsCore';
import type {InterfaceAsset,InterfaceDocument} from '../interface/schema';
/** SVG is a strict solid-shape snapshot, never raw SVG. Rasterise the validated primitives to the same canonical bounded PNG as Interface. */
export async function prepareAnimationAsset(file:File):Promise<InterfaceAsset>{
 if(!file.name.toLowerCase().endsWith('.svg'))return prepareRasterAsset(file);
 if(file.size>200_000)throw Error('SVG must be under 200 KB.');
 const svg=parseInterfaceSVG(await file.text());checkImageDimensions(svg.width,svg.height);
 const nodes=svg.shapes.map((s,i)=>({id:String(i),kind:s.kind,path:s.path,stroke:s.stroke,strokeWidth:s.strokeWidth}));
 validateInterfaceVectors({nodes} as unknown as InterfaceDocument);
 const canvas=document.createElement('canvas');canvas.width=svg.width;canvas.height=svg.height;
 const ctx=canvas.getContext('2d');if(!ctx)throw Error('Image renderer unavailable.');
 for(const s of svg.shapes){ctx.save();ctx.translate(s.x,s.y);ctx.fillStyle=s.fill;ctx.strokeStyle=s.stroke??s.fill;ctx.lineWidth=s.strokeWidth??1;
  const p=new Path2D();if(s.kind==='ellipse')p.ellipse(s.width/2,s.height/2,s.width/2,s.height/2,0,0,2*Math.PI);else if(s.kind==='rectangle')p.rect(0,0,s.width,s.height);else if(s.path){const path=new Path2D(pathData(s.path,s.width,s.height));if(s.path.closed)ctx.fill(path);if(s.stroke)ctx.stroke(path);ctx.restore();continue;}else {p.moveTo(0,0);p.lineTo(s.width,s.height);}
  if(s.kind!=='line')ctx.fill(p);if(s.stroke||s.kind==='line')ctx.stroke(p);ctx.restore();
 }
 const blob=await new Promise<Blob>((ok,no)=>canvas.toBlob(b=>b?ok(b):no(Error('SVG snapshot failed.')),'image/png'));
 return prepareRasterAsset(new File([blob],file.name,{type:'image/png'}));
}
