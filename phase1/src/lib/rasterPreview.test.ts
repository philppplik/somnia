import test from 'node:test';
import assert from 'node:assert/strict';
import {sniffRaster,RASTER_FILE} from './rasterPreview';
import {MEDIA_FILE,sniffMedia} from './media';
test('raster extensions route to preview, not text or editing',()=>{
 for(const ext of ['BMP','ico','tga','tif','tiff','qoi','ppm','pnm','gif','avif','webp']){assert.ok(RASTER_FILE.test(`x.${ext}`));assert.ok(MEDIA_FILE.test(`x.${ext}`));}
 for(const ext of ['heic','raw','psd','svg','exe'])assert.equal(RASTER_FILE.test(`x.${ext}`),false);
});
test('signatures identify formats, not names or untrusted MIME',()=>{
 for(const [bytes,mime] of [[Buffer.from('BMtest'),'image/bmp'],[Buffer.from('GIF89a'),'image/gif'],[Buffer.from('qoif'),'image/qoi'],[Buffer.from('P6\n'),'image/x-portable-anymap'],[Uint8Array.of(0,0,1,0),'image/x-icon'],[Uint8Array.of(73,73,42,0),'image/tiff']] as const)assert.equal(sniffRaster(bytes),mime);
 assert.equal(sniffRaster(Buffer.from('not an image')),null);
 assert.equal(sniffMedia(Buffer.from('%PDF-1.7'))?.kind,'pdf');
});
test('AVIF compatible brand is recognized, HEIC is not',()=>{
 const box=(brand:string,compat:string)=>{const out=Buffer.alloc(24);out.writeUInt32BE(24);out.write('ftyp',4);out.write(brand,8);out.write(compat,16);return out;};
 assert.equal(sniffRaster(box('avif','mif1')),'image/avif');
 assert.equal(sniffRaster(box('mif1','avif')),'image/avif');
 assert.equal(sniffRaster(box('heic','mif1')),null);
});

test('native formats and existing document adapters keep their original routing',()=>{
 for(const [bytes,kind] of [[Uint8Array.of(137,80,78,71,13,10,26,10),'image'],[Uint8Array.of(255,216,255),'image'],[Buffer.from('RIFFxxxxWEBP'),'image'],[Uint8Array.of(56,66,80,83,0,1),'psd'],[Buffer.from('BMtest'),'raster-preview']] as const)assert.equal(sniffMedia(bytes)?.kind,kind);
 for(const ext of ['psd','docx','xlsx','pdf'])assert.ok(MEDIA_FILE.test('document.'+ext));
 for(let n=0;n<16;n++){const bytes=Buffer.alloc(n);if(n>=8)bytes.write('ftyp',4);assert.doesNotThrow(()=>sniffRaster(bytes));}
});

test('batch detection and targets are honest about the additional import adapters',async()=>{
 const {detectFormat,TARGETS}=await import('./convert/formats');const {MEDIA_PATH}=await import('./collab/blobSync');
 for(const [name,bytes,id] of [['r.tiff',Uint8Array.of(73,73,42,0),'tiff'],['r.qoi',Buffer.from('qoif'),'qoi'],['r.ico',Uint8Array.of(0,0,1,0),'ico'],['r.ppm',Buffer.from('P6\n1 1\n255\n'),'pnm'],['r.tga',Buffer.from('hint only, decoder validates'),'tga']] as const){assert.equal(detectFormat(name,bytes),id);assert.deepEqual(TARGETS[id],['png','jpg','webp']);assert.ok(MEDIA_PATH.test(name));}
 for(const name of ['x.tiff','x.ico','x.qoi','x.avif'])assert.equal(detectFormat(name,Buffer.from('garbage')),'unknown');
});
