import test from 'node:test';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {getStudio,listStudios,acceptsFormat} from '../studios';
import {getState,patchState,requestStudio} from '../../store/appStore';
import {CATALOGUES} from '../i18n';
import {studioShortName} from '../../components/studios/studioShortName';
test('Vibe Space is a real studio beside Photos, with no document claims or editor rails',()=>{
 const s=getStudio('vibespace');
 assert.ok(listStudios().find(x=>x.id==='photos'));
 assert.equal(listStudios().at(-1)?.id,'vibespace');
 assert.equal(s.canvas,'vibespace.canvas');assert.equal(s.icon,'Bot');
 assert.deepEqual(s.shell.leftRail,[]);assert.deepEqual(s.shell.rightRail,[]);
 for(const file of ['photo.jpg','book.xlsx','index.html'])assert.equal(acceptsFormat(s,file),false);
 for(const c of Object.values(CATALOGUES))assert.equal(c[s.label],'Vibe Space');
 assert.equal(studioShortName(s.id,'Vibe Space'),'Vibe Space');
});
test('visiting Vibe Space and returning preserves the open document and its dirty content',()=>{
 const before=getState();const files={'index.html':'unsaved work'};
 try{
  patchState({activeStudio:'code',activeFile:'index.html',files,isDirty:true,revision:7,agentOpen:true});
  assert.equal(requestStudio('vibespace'),'changed');
  const s=getState();assert.equal(s.activeStudio,'vibespace');assert.equal(s.activeFile,'index.html');
  assert.equal(s.files,files);assert.equal(s.isDirty,true);assert.equal(s.revision,7);assert.equal(s.agentOpen,true);
  assert.equal(requestStudio('photos'),'changed');assert.equal(requestStudio('code'),'changed');
  assert.equal(getState().files,files);assert.equal(getState().isDirty,true);
 }finally{patchState({activeStudio:before.activeStudio,activeFile:before.activeFile,files:before.files,isDirty:before.isDirty,revision:before.revision,agentOpen:before.agentOpen,studioByTab:before.studioByTab,studioChoice:before.studioChoice});}
});

test('the workspace host is mounted centrally and the communication tab strip is gone',()=>{
 const hosts=readFileSync(new URL('../../components/studios/hosts.tsx',import.meta.url),'utf8');
 const communication=readFileSync(new URL('../../components/CommunicationPanel.tsx',import.meta.url),'utf8');
 assert.match(hosts,/'vibespace.canvas':DesktopVibeSpacePanel/);
 assert.doesNotMatch(communication,/role="tablist"|communication-tabs|DesktopVibeSpacePanel/);
});
