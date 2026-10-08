import init,{PdfCraft} from '../pkg/somnia_pdf_craft.js';
const start=performance.now();
const ready=init().then(()=>performance.now()-start);
self.onmessage=async({data})=>{try{const initMs=await ready;const begin=performance.now();const doc=new PdfCraft(new Uint8Array(data));const info=JSON.parse(doc.info());const parseMs=performance.now()-begin;const t=performance.now();const rgba=doc.render(0,1);const renderMs=performance.now()-t;const width=doc.width(),height=doc.height();doc.free();self.postMessage({initMs,parseMs,renderMs,info,width,height,rgba},[rgba.buffer]);}catch(e){self.postMessage({error:String(e)});}};
