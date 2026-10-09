/** Manual Chromium harness; not imported by the app. No production UI changes. */
import { createImportFixture } from './fixtures.ts';
import { importPdfInBrowser } from './browser.ts';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { ImportedPdfPage } from './types.ts';
const $=(id:string)=>document.getElementById(id)!;
function canvas(id:string,page:ImportedPdfPage) {
  const c=$(id) as HTMLCanvasElement;c.width=page.width*1.4;c.height=page.height*1.4;
  const ctx=c.getContext('2d')!;ctx.scale(1.4,1.4);return {c,ctx};
}
async function run(){
  const bytes=await createImportFixture();
  const imported=await importPdfInBrowser(bytes);
  GlobalWorkerOptions.workerSrc=workerUrl;
  const doc=await getDocument({data:bytes.slice()}).promise;
  const show=async(index:number)=>{
    const p=imported.pages[index];
    document.querySelectorAll('nav button').forEach((b,i)=>b.classList.toggle('active',i===index));
    const original=canvas('original',p);original.ctx.setTransform(1,0,0,1,0,0);const source=await doc.getPage(index+1);
    await source.render({canvas:original.c,viewport:source.getViewport({scale:1.4})}).promise;
    const {ctx}=canvas('imported',p);
    for(const v of p.vectors) {
      ctx.beginPath();
      for(const c of v.commands){
        if(c.kind==='move')ctx.moveTo(...c.point);
        else if(c.kind==='line')ctx.lineTo(...c.point);
        else if(c.kind==='cubic')ctx.bezierCurveTo(...c.control1,...c.control2,...c.point);
        else if(c.kind==='quadratic')ctx.quadraticCurveTo(...c.control,...c.point);
        else ctx.closePath();
      }
      if(v.fill){ctx.fillStyle=v.fill;ctx.globalAlpha=v.fillOpacity;ctx.fill(v.fillRule);}
      if(v.stroke){ctx.strokeStyle=v.stroke;ctx.lineWidth=v.lineWidth;ctx.globalAlpha=v.strokeOpacity;ctx.stroke();}
    }
    ctx.globalAlpha=1;
    for(const image of p.images){
      const img=new Image();img.src=image.dataUrl;await img.decode();
      ctx.save();ctx.imageSmoothingEnabled=image.interpolate;ctx.transform(...image.transform);ctx.drawImage(img,0,0,1,1);ctx.restore();
    }
    for(const t of p.text){
      ctx.save();const m=t.transform;const scale=t.fontSize;
      ctx.transform(m[0]/scale,m[1]/scale,-m[2]/scale,-m[3]/scale,m[4],m[5]);
      ctx.font=`${scale}px sans-serif`;ctx.fillStyle='#273045';ctx.fillText(t.text,0,0);ctx.restore();
      ctx.strokeStyle='#7955da';ctx.lineWidth=0.8;ctx.strokeRect(t.bounds.x,t.bounds.y,t.bounds.width,t.bounds.height);
    }
    $('metrics').textContent=`Page ${p.number} · ${p.width} × ${p.height} pt · rotation ${p.rotation}° · ${p.text.length} text run · ${p.vectors.length} vectors · ${p.images.length} images`;
    $('diagnostics').textContent=p.diagnostics.map(d=>d.message).join(' ');
    (window as any).__inspectionReady=p.number;
  };
  imported.pages.forEach((p,i)=>{
    const button=document.createElement('button');button.setAttribute('aria-label',`Page ${p.number}`);
    const img=document.createElement('img');img.src=p.thumbnail!.dataUrl;img.alt=`Page ${p.number} thumbnail`;
    button.append(img,document.createTextNode(`Page ${p.number}`));button.onclick=()=>{void show(i);};$('pages').append(button);
  });
  $('status').textContent='Imported successfully · 2 pages · PNG thumbnails ready';
  (window as any).__importedPdf=imported;
  await show(0);
}
run().catch(e=>{$('status').textContent=String(e);console.error(e);});
