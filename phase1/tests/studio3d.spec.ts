import {test,expect} from './fixtures';
/** CI-only: needs a browser with WebGL (headless Chromium uses SwiftShader). Not run in the authoring sandbox. */
function triangleGlb():Buffer{
 const pos=Buffer.from(new Float32Array([0,0,0,1,0,0,0,1,0]).buffer),idx=Buffer.from(new Uint16Array([0,1,2,0]).buffer);
 const bin=Buffer.concat([pos,idx]);
 const json={asset:{version:'2.0'},scene:0,scenes:[{nodes:[0]}],nodes:[{mesh:0,name:'Triangle'}],meshes:[{primitives:[{attributes:{POSITION:0},indices:1}]}],buffers:[{byteLength:bin.length}],
  bufferViews:[{buffer:0,byteOffset:0,byteLength:36},{buffer:0,byteOffset:36,byteLength:6}],accessors:[{bufferView:0,componentType:5126,count:3,type:'VEC3',min:[0,0,0],max:[1,1,0]},{bufferView:1,componentType:5123,count:3,type:'SCALAR'}]};
 const pad=(b:Buffer,f:number)=>{const o=Buffer.alloc((b.length+3)&~3,f);b.copy(o);return o;};
 const j=pad(Buffer.from(JSON.stringify(json)),0x20),b=pad(bin,0),total=12+8+j.length+8+b.length;
 const h=Buffer.alloc(12);h.writeUInt32LE(0x46546c67,0);h.writeUInt32LE(2,4);h.writeUInt32LE(total,8);
 const c1=Buffer.alloc(8);c1.writeUInt32LE(j.length,0);c1.writeUInt32LE(0x4e4f534a,4);const c2=Buffer.alloc(8);c2.writeUInt32LE(b.length,0);c2.writeUInt32LE(0x004e4942,4);
 return Buffer.concat([h,c1,j,c2,b]);
}
test('3D studio opens a GLB, shows its stats and exports a still',async({page})=>{
 await page.goto('/');
 await page.getByRole('button',{name:/3D/}).first().click();
 await expect(page.getByTestId('3d-start')).toBeVisible();
 await page.getByTestId('studio3d-file-input').setInputFiles({name:'tri.glb',mimeType:'model/gltf-binary',buffer:triangleGlb()});
 await expect(page.getByTestId('studio3d-viewport')).toBeVisible();
 await expect(page.getByTestId('studio3d-model-section')).toContainText('GLB');
 await expect(page.getByTestId('studio3d-model-section')).toContainText('1');
 await expect(page.getByTestId('studio3d-scene-panel')).toContainText('Triangle');
 const [download]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'Render still'}).click()]);
 expect(download.suggestedFilename()).toBe('tri-still.png');
});
test('3D studio refuses a file that is not glTF with a readable error',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:/3D/}).first().click();
 await page.getByTestId('studio3d-file-input').setInputFiles({name:'bad.glb',mimeType:'model/gltf-binary',buffer:Buffer.from('not a model')});
 await expect(page.getByRole('alert')).toContainText('bad.glb');
});
