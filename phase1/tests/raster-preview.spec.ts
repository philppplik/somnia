import {test,expect} from './fixtures';
import path from 'node:path';
for(const ext of ['bmp','ico','tga','tiff','qoi','gif','ppm','avif'])test(`image-rs ${ext} preview and PNG conversion`,async({page})=>{
 await page.goto('/',{waitUntil:'domcontentloaded'});
 await expect(page.locator('[data-storage]')).toBeVisible();
 const chooser=page.waitForEvent('filechooser');
 await page.evaluate(async()=>{const m=await import('/src/lib/commands.ts');void m.executeCommand('project.openFile');});
 await (await chooser).setFiles(path.join(import.meta.dirname,'assets','raster',`raster.${ext}`));
 await expect(page.getByTestId('media-image')).toBeVisible();
 await expect(page.getByTestId('media-dims')).toHaveText(ext==='ppm'?'2 x 1 px':'240 x 160 px');
 await expect(page.getByTestId('raster-warning')).toContainText('Preview / conversion only');
 await expect(page.getByTestId('image-editor-stage')).toHaveCount(0);
 const original=await page.evaluate(async()=>{const m=await import('/src/lib/media.ts');const s=await import('/src/store/appStore.ts');const item=m.getMedia().items[0];return{kind:item.kind,hasSource:!!item.sourceUrl,rasterDocs:Object.keys(s.getState().rasterDoc)};});
 expect(original).toEqual({kind:'raster-preview',hasSource:true,rasterDocs:[]});
 const conversion=await page.evaluate(async(ext)=>{
  const response=await fetch(`/tests/assets/raster/raster.${ext}`);const bytes=await response.blob();
  const m=await import('/src/lib/imageConversion.ts');const result=await m.convertImage(bytes,`raster.${ext}`,{format:'png'});
  const bitmap=await createImageBitmap(result.blob);const c=document.createElement('canvas');c.width=bitmap.width;c.height=bitmap.height;const ctx=c.getContext('2d')!;ctx.drawImage(bitmap,0,0);const pixel=Array.from(ctx.getImageData(0,0,1,1).data);bitmap.close();
  const batch=await import('/src/lib/convert/engine.ts');const formats=await import('/src/lib/convert/formats.ts');const raster=await import('/src/lib/convert/raster.ts');const input=new Uint8Array(await bytes.arrayBuffer());const from=formats.detectFormat(`raster.${ext}`,input);const out=await batch.convertFile(`raster.${ext}`,input,from,'png',{rasterize:raster.canvasRasterizer});
  return {name:result.filename,mime:result.blob.type,width:result.width,height:result.height,pixel,batch:{name:out.name,mime:out.mime,magic:formats.sniffBinary(out.bytes),warnings:out.warnings?.length}};
 },ext);
 expect(conversion).toMatchObject({name:'raster.png',mime:'image/png',width:ext==='ppm'?2:240,height:ext==='ppm'?1:160,batch:{name:'raster.png',mime:'image/png',magic:'png',warnings:1}});
 if(ext!=='avif')expect(conversion.pixel).toEqual([124,58,237,255]);
 if(['tiff','tga','ico'].includes(ext))await page.screenshot({path:`test-results/raster-${ext}.png`});
});
test('unsupported signature gives a clear error, never a text document',async({page})=>{
 await page.goto('/',{waitUntil:'domcontentloaded'});await expect(page.locator('[data-storage]')).toBeVisible();
 const result=await page.evaluate(async()=>{const m=await import('/src/lib/media.ts');return m.addMediaFile(new Blob(['garbage']),'fake.tiff');});
 expect(result).toHaveProperty('error');expect(JSON.stringify(result)).toContain('not a valid supported raster');
});

test('TGA conversion dialog chooses the real file name and shows limitations',async({page})=>{
 await page.goto('/',{waitUntil:'domcontentloaded'});await expect(page.locator('[data-storage]')).toBeVisible();
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('somnia:convert-image')));
 await page.getByLabel('Source image').setInputFiles(path.join(import.meta.dirname,'assets','raster','raster.tga'));
 await expect(page.getByText('Original: 240 x 160 px.',{exact:false})).toBeVisible();
 await page.getByRole('button',{name:'Convert',exact:true}).click();
 await expect(page.getByRole('button',{name:'Download',exact:true})).toBeVisible();
 await page.screenshot({path:'test-results/raster-convert-dialog.png'});
});

test('preview resource ownership, replacement guards, original collab bytes and cleanup',async({page})=>{
 await page.goto('/',{waitUntil:'domcontentloaded'});await expect(page.locator('[data-storage]')).toBeVisible();
 const result=await page.evaluate(async()=>{
  const media=await import('/src/lib/media.ts');const collab=await import('/src/lib/collab/appMedia.ts');
  const source=new Uint8Array(await (await fetch('/tests/assets/raster/raster.qoi')).arrayBuffer());
  const added=await media.addMediaFile(new Blob([source]),'img/raster.qoi','img/raster.qoi');if('error' in added)throw Error(added.error);
  const first=media.findMedia(added.name)!;const peer=collab.appMedia.list().find(i=>i.path===added.name)!;const shared=await peer.read();
  const unguard=media.registerMediaCloseGuard(name=>name!==added.name);
  const replacement=await media.addMediaFile(new Blob([source]),added.name,added.name);
  media.closeMedia(added.name);const retained=media.findMedia(added.name)?.url===first.url;const cleared=media.clearMedia();unguard();
  const bad=await media.addMediaFile(new Blob(['BMbroken']),added.name,added.name);const unchanged=media.findMedia(added.name)?.url===first.url;
  media.closeMedia(added.name);const revoked=await Promise.all([first.url,first.sourceUrl!].map(async url=>{try{await fetch(url);return false;}catch{return true;}}));
  return {sameOriginal:shared.every((v,i)=>v===source[i])&&shared.length===source.length,replacement,retained,cleared,bad,unchanged,revoked};
 });
 expect(result.sameOriginal).toBe(true);expect(result.replacement).toHaveProperty('error','Replacing the image was cancelled.');expect(result.retained).toBe(true);expect(result.cleared).toBe(false);expect(result.bad).toHaveProperty('error');expect(result.unchanged).toBe(true);expect(result.revoked).toEqual([true,true]);
});
test('PNG stays in the A2 inline editor with real crop history and discard guard',async({page})=>{
 page.on('dialog',dialog=>dialog.dismiss());await page.goto('/',{waitUntil:'domcontentloaded'});await expect(page.locator('[data-storage]')).toBeVisible();
 const chooser=page.waitForEvent('filechooser');await page.evaluate(async()=>{const m=await import('/src/lib/projectActions.ts');void m.openMediaDialog();});await (await chooser).setFiles(path.join(import.meta.dirname,'assets','raster','raster.png'));
 await expect(page.getByTestId('image-editor-stage')).toBeVisible();await expect(page.getByTestId('raster-warning')).toHaveCount(0);
 await expect.poll(()=>page.evaluate(async()=>Object.keys((await import('/src/lib/agent/photoWorkspace.ts')).photoFiles()))).toEqual(['raster.png']);
 const changed=await page.evaluate(async()=>{const p=await import('/src/lib/agent/photoWorkspace.ts');const e=p.assertPhoto('raster.png');e.commit({...e.state.now,stack:[{id:'adapter-regression',type:'crop',version:1,enabled:true,params:{x:0,y:0,width:120,height:80}}]});const media=await import('/src/lib/media.ts');const before=media.findMedia('raster.png')!.url;media.closeMedia('raster.png');return {kept:media.findMedia('raster.png')?.url===before,dirty:p.assertPhoto('raster.png').dirty};});
 expect(changed).toEqual({kept:true,dirty:true});await page.getByRole('button',{name:'Undo',exact:true}).click();await expect.poll(()=>page.evaluate(async()=>(await import('/src/lib/agent/photoWorkspace.ts')).assertPhoto('raster.png').dirty)).toBe(false);
 await page.screenshot({path:'test-results/raster-native-a2.png'});
});

test('batch conversion dialog recognizes TIFF, downloads PNG and reports flattening',async({page})=>{
 await page.goto('/',{waitUntil:'domcontentloaded'});await expect(page.locator('[data-storage]')).toBeVisible();
 await page.evaluate(async()=>{const m=await import('/src/lib/commands.ts');await m.executeCommand('tools.convert');});
 await page.getByTestId('convert-input').setInputFiles(path.join(import.meta.dirname,'assets','raster','raster.tiff'));
 await expect(page.getByRole('radio',{name:'PNG',exact:true})).toBeChecked();
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'Convert to PNG',exact:true}).click();expect((await download).suggestedFilename()).toBe('raster.png');
 await expect(page.getByRole('alert')).toContainText('First image/frame only');
 await page.screenshot({path:'test-results/raster-batch-tiff.png'});
});
test('extra formats from a real project folder are read-only previews, not text',async({page})=>{
 await page.goto('/',{waitUntil:'domcontentloaded'});await expect(page.locator('[data-storage]')).toBeVisible();
 const result=await page.evaluate(async()=>{
  const root=await navigator.storage.getDirectory();const dir=await root.getDirectoryHandle('raster-folder',{create:true});
  for(const ext of ['tiff','tga','qoi']){const bytes=await(await fetch(`/tests/assets/raster/raster.${ext}`)).arrayBuffer();const handle=await dir.getFileHandle(`raster.${ext}`,{create:true});const writer=await handle.createWritable();await writer.write(bytes);await writer.close();}
  const {createWebFsPort,memoryJournal}=await import('/src/lib/webFsPort.ts');const port=createWebFsPort({pickDirectory:async()=>dir,journal:memoryJournal()});const project=await port.invoke<{projectId:string}>('choose_project');const paths=await port.invoke<string[]>('list_files',project);
  const {loadFolderMedia}=await import('/src/lib/folderMedia.ts');return await loadFolderMedia((c,a)=>port.invoke(c,a),project.projectId,paths);
 });
 expect(result.skipped).toEqual([]);expect(result.loaded).toEqual(['raster.qoi','raster.tga','raster.tiff']);
 await page.evaluate(async()=>{const m=await import('/src/lib/media.ts');m.setActiveMedia('raster.tiff');});await expect(page.getByTestId('media-dims')).toHaveText('240 x 160 px');await expect(page.getByTestId('image-editor-stage')).toHaveCount(0);
});

test('missing decoder and oversized inputs report failure without replacing existing media',async({page})=>{
 await page.goto('/',{waitUntil:'domcontentloaded'});await expect(page.locator('[data-storage]')).toBeVisible();
 await page.route('**/rasterPreview.worker.ts*',route=>route.abort());
 const result=await page.evaluate(async()=>{const m=await import('/src/lib/media.ts');const bytes=await(await fetch('/tests/assets/raster/raster.tiff')).blob();return {failed:await m.addMediaFile(bytes,'raster.tiff'),large:await m.addMediaFile(new Blob([new Uint8Array(25_000_001)]),'large.tiff'),count:m.getMedia().items.length};});
 expect(result.failed).toHaveProperty('error');expect(JSON.stringify(result.failed)).toContain('Raster decoder failed');expect(JSON.stringify(result.large)).toContain('larger than 25 MB');expect(result.count).toBe(0);
});
