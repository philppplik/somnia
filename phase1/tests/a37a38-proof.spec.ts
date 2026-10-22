import {expect,test} from '@playwright/test';
import {switchStudio} from './helpers';

/**
 * Regression proofs for A37 (selectSame) and A38 (textToPath) in a real browser session.
 * The textToPath test is FONT- AND API-DEPENDENT: it needs the real Local Font Access API
 * (queryLocalFonts) and at least one installed system font. Where the API is missing
 * (Safari, Firefox, WKWebView in the macOS app, WebKitGTK in the Linux app) the test SKIPS:
 * missing platform support is never counted as success. A pass proves the Chromium engine
 * path (Chrome/Edge and the WebView2 engine used by the Windows app); it does NOT prove the
 * WebView2 permission-prompt flow, which remains a manual hardware check.
 */
const openVector=async(page:any)=>{await page.goto('/');await switchStudio(page,'Somnia Vector');await page.getByTestId('vector-create-blank').click();};

test('A38 textToPath: real queryLocalFonts + real system font produce glyph outlines',async({page,context},info)=>{
 info.annotations.push({type:'requires',description:'queryLocalFonts (Local Font Access) + >=1 installed system font; skips where the platform lacks support'});
 await openVector(page);
 await context.grantPermissions(['local-fonts']);
 const probe=await page.evaluate(async()=>{
  if(typeof (window as any).queryLocalFonts!=='function')return {api:false,family:''};
  const fonts=await (window as any).queryLocalFonts();
  return {api:true,family:fonts.length?String(fonts[0].family):''};});
 test.skip(!probe.api,'queryLocalFonts unsupported on this engine (Safari/Firefox/WKWebView/WebKitGTK) - missing support is not a pass');
 test.skip(!probe.family==true,'queryLocalFonts returned no system fonts');
 const id=await page.evaluate(async(family)=>{
  const m=await import('/src/lib/commands.ts');
  await m.executeCommand('vector.addText',{x:100,y:100,text:'Hallo',fontFamily:family,fontSize:40,fill:'#112233'});
  const S=await import('/src/lib/vectorstudio/session.ts');
  const t=S.getVectorSession().doc.texts![0];
  await m.executeCommand('vector.selectText',{id:t.id});
  return t.id;},probe.family);
 await page.evaluate(async(id)=>{
  const m=await import('/src/lib/commands.ts');
  await m.executeCommand('vector.textToPath',{id});},id);
 const after=await page.evaluate(async()=>{const S=await import('/src/lib/vectorstudio/session.ts');const d=S.getVectorSession().doc;return {texts:(d.texts??[]).length,paths:d.paths.length,sel:S.getVectorSession().selection.length,nodes:d.paths.map(p=>p.nodes.length).reduce((a,b)=>a+b,0)};});
 expect(after.texts).toBe(0);
 expect(after.paths).toBeGreaterThan(3); // 5 glyphs incl. compound contour (o)
 expect(after.sel).toBe(after.paths);
 expect(after.nodes).toBeGreaterThan(30); // real glyph outlines, not a stub
});

test('A38 textToPath: without queryLocalFonts the UI fails closed with the localized platform note',async({page})=>{
 await page.addInitScript(()=>{delete (window as any).queryLocalFonts;});
 await openVector(page);
 await page.evaluate(async()=>{
  const m=await import('/src/lib/commands.ts');
  await m.executeCommand('vector.addText',{x:100,y:100,text:'Hallo',fontFamily:'AnyFamily',fontSize:40});
  const S=await import('/src/lib/vectorstudio/session.ts');
  await m.executeCommand('vector.selectText',{id:S.getVectorSession().doc.texts![0].id});});
 await page.getByTestId('vector-text-to-path').click();
 await expect(page.getByTestId('vector-text-note')).toContainText('not accessible here');
 await expect(page.getByTestId('vector-text-note')).toContainText('Windows app');
 const kept=await page.evaluate(async()=>{const S=await import('/src/lib/vectorstudio/session.ts');return {texts:(S.getVectorSession().doc.texts??[]).length,paths:S.getVectorSession().doc.paths.length};});
 expect(kept.texts).toBe(1); // fail closed: text kept, nothing half-converted
 expect(kept.paths).toBe(0);
});

test('A37 selectSame: same-fill shapes selected in a real session (engine-independent)',async({page})=>{
 await openVector(page);
 const r=await page.evaluate(async()=>{
  const m=await import('/src/lib/commands.ts');
  const S=await import('/src/lib/vectorstudio/session.ts');
  const doc=S.getVectorSession().doc;
  const mk=(id:string,fill:string)=>({id,closed:true,nodes:[{id:id+'a',x:0,y:0,kind:'corner'},{id:id+'b',x:40,y:0,kind:'corner'},{id:id+'c',x:40,y:40,kind:'corner'},{id:id+'d',x:0,y:40,kind:'corner'}],style:{fill,stroke:'#000000',strokeWidth:1}} as any);
  S.commit({...doc,paths:[...doc.paths,mk('r1','#ff0000'),mk('r2','#FF0000'),mk('r3','#00ff00')]},{selection:['r1'],nodePath:null,selectedNode:null});
  await m.executeCommand('vector.selectSame',{mode:'fill'});
  return S.getVectorSession().selection;});
 expect([...r].sort()).toEqual(['r1','r2']);
});
