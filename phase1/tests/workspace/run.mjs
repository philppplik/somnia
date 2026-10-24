// Standalone local browser regression. No native-window claims, no CI workflow changes.
import assert from 'node:assert/strict';
import {startServer,openApp} from '../../scripts/agent-harness/harness.mjs';
const server=await startServer({port:1431});let app;
try{
 app=await openApp({url:server.url,outDir:'tests/artifacts/workspace'});
 await app.page.getByRole('button',{name:'Tabbed panel docking',exact:true}).click();
 await app.page.getByRole('tab',{name:'Layers',exact:true}).waitFor();
 await app.page.getByRole('button',{name:'Move panel right',exact:true}).click();
 assert.deepEqual(await app.page.locator('.workspace-dock').nth(1).getByRole('tab').allTextContents(),['Inspector','Layers']);
 await app.ctl.screenshot('docking-moved');
 await app.page.reload();await app.page.getByRole('tab',{name:'Layers',exact:true}).waitFor();
 assert.deepEqual(await app.page.locator('.workspace-dock').nth(1).getByRole('tab').allTextContents(),['Inspector','Layers']);
 await app.page.getByRole('button',{name:'Reset panel docking',exact:true}).click();
 assert.deepEqual(await app.page.locator('.workspace-dock').nth(0).getByRole('tab').allTextContents(),['Layers']);
 // Real HTML5 drag/drop tab transfer.
 await app.page.getByRole('tab',{name:'Layers',exact:true}).dragTo(app.page.getByRole('tab',{name:'Inspector',exact:true}));
 assert.deepEqual(await app.page.locator('.workspace-dock').nth(1).getByRole('tab').allTextContents(),['Layers','Inspector']);
 await app.page.getByRole('tab',{name:'Layers',exact:true}).focus();await app.page.keyboard.press('ArrowRight');
 assert.equal(await app.page.getByRole('tab',{name:'Inspector',exact:true}).getAttribute('aria-selected'),'true');
 const copy=await app.browser.newPage({viewport:{width:1100,height:800}}),errors=[];copy.on('pageerror',e=>errors.push(e.message));
 await copy.addInitScript(()=>sessionStorage.setItem('somnia.copy.test',JSON.stringify({version:1,studio:'code',name:'Copy test',files:{'index.html':'<h1>Independent copy</h1>','notes.md':'# Independent Code copy\n\nThis window edits its own snapshot.'},activeFile:'notes.md',locale:'en'})));
 await copy.goto(server.url+'/studio-copy.html',{waitUntil:'domcontentloaded'});await copy.locator('.cm-content').waitFor();
 await copy.locator('.cm-content').fill('# Edited copy\n\nOnly this window changes.');
 await copy.waitForTimeout(500);await copy.getByRole('heading',{name:'Edited copy',exact:true}).waitFor();
 await copy.getByRole('button',{name:'Close window',exact:true}).click();await copy.getByRole('dialog').waitFor();
 await copy.getByRole('button',{name:'Cancel',exact:true}).click();
 await copy.screenshot({path:'tests/artifacts/workspace/studio-copy.png'});
 assert.equal(await app.ctl.getState('activeFile'),'index.html');assert.deepEqual(errors,[]);assert.deepEqual(app.errors,[]);
 console.log('Workspace browser regression: PASS (moves, drag/drop, keyboard tabs, reload, reset, copy editing/preview, dirty close, source independence)');
}finally{await app?.close();server.stop();}
