import {test,expect} from './fixtures';
import type {Page} from '@playwright/test';
/** Isolated local peers exercise actual Yjs, encrypted CollabClient subchannel and app widgets. */
async function session(page:Page,theme='light'){
 await page.goto('/');await page.evaluate(async theme=>{
  const [{getState,patchState},{CollabDoc},{ChatModel},{ChatSession,setChatSession},{setSession},{CollabClient},{makeUser},{newLinkKey}]=await Promise.all([
   import('/src/store/appStore.ts'),import('/src/lib/collab/collabDoc.ts'),import('/src/lib/collab/chatModel.ts'),import('/src/lib/collab/chatSession.ts'),import('/src/lib/collab/session.ts'),import('/src/lib/collab/net/client.ts'),import('/src/lib/collab/awarenessSafe.ts'),import('/src/lib/collab/net/crypto.ts')]);
  const {Awareness}=await import('/node_modules/.vite/deps/y-protocols_awareness.js');
  const Y=await import('/node_modules/.vite/deps/yjs.js');
  const project=new CollabDoc();for(const [path,text] of Object.entries(getState().files))project.text(path,text as string);
  project.awareness.setLocalStateField('user',makeUser('Philipp',project.doc.clientID));
  const model=new ChatModel();const key=await newLinkKey();
  const client=new CollabClient(`ws://127.0.0.1/room/abcdefgh#key=${key.param}`,{session:{doc:project.doc,awareness:project.awareness},chatDoc:model.doc,syncTimeoutMs:1,transport:()=>({connect(h:any){queueMicrotask(()=>h.onOpen());},send(){},close(){}})});
  await client.connect();setSession(project);const chat=new ChatSession(project,client,'host',model);setChatSession(chat);model.assignColour(chat.localId);model.assignColour('mara');model.assignColour('ayse');
  const remote=new Awareness(new Y.Doc());const text=project.files.get(getState().activeFile)!;const pos=Y.createRelativePositionFromTypeIndex(text,Math.min(120,text.length));
  remote.setLocalState({user:{name:'Mara',color:'#C2410C',participantId:'mara'},cursor:{anchor:pos,head:pos},file:getState().activeFile,activity:1});
  const aw=await import('/node_modules/.vite/deps/y-protocols_awareness.js');aw.applyAwarenessUpdate(project.awareness,aw.encodeAwarenessUpdate(remote,[remote.clientID]),'fixture');
  const second=new Awareness(new Y.Doc());second.setLocalState({user:{name:'Ayse',color:'#0F766E',participantId:'ayse'},file:'styles.css'});aw.applyAwarenessUpdate(project.awareness,aw.encodeAwarenessUpdate(second,[second.clientID]),'fixture');
  patchState({viewMode:'code',themeChoice:theme as any,theme:theme as any});
  (window as any).__chatFixture={chat,project,remote,second,client,model};
  const original=model.send({author:chat.author(),body:'I am updating the hero. Please check the navigation.',mentions:[],attachments:[]});
  model.send({author:{id:'mara',name:'Mara',token:1},body:'@Philipp could you look at the mobile headline?',mentions:[chat.localId],replyTo:original.id,reference:{file:getState().activeFile,line:3},attachments:[]});
 },theme);
}
for(const theme of ['light','dark'])test(`chat and cursor ${theme}: mentions, reply, files, cleanup`,async({page})=>{
 await session(page,theme);
 await page.keyboard.press('Control+Shift+C');const panel=page.getByRole('region',{name:'Session chat'});await expect(panel).toBeVisible();await expect(panel.getByText('Only in this session')).toBeVisible();await expect(panel.getByText('@Philipp could you look at the mobile headline?',{exact:false})).toBeVisible();
 const input=panel.getByLabel('Session message');await input.fill('Thanks @');await expect(panel.getByRole('listbox')).toBeVisible();await panel.getByRole('option',{name:/Mara/}).click();await input.press('Enter');await expect(panel.getByText('Thanks @Mara')).toBeVisible();
 await panel.getByRole('button',{name:'Reply',exact:true}).first().click();await input.fill('Checking now.');await input.press('Enter');await expect(panel.getByText('Checking now.')).toBeVisible();
 await panel.locator('input[type=file]').setInputFiles({name:'reference.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4\nfixture')});await expect(panel.getByText('reference.pdf',{exact:false})).toBeVisible();await panel.getByRole('button',{name:'Send',exact:false}).click();await expect(panel.getByRole('link',{name:'Download'})).toBeVisible();
 await expect(page.locator('.cm-ySelectionInfo',{hasText:'Mara'}).first()).toBeAttached();
 await page.evaluate(()=>{const f=(window as any).__chatFixture;const s=f.remote.getLocalState();f.remote.setLocalState({...s,activity:2});});
 // Actively paint a peer update; local peer never writes project content.
 await page.evaluate(async()=>{const aw=await import('/node_modules/.vite/deps/y-protocols_awareness.js');const f=(window as any).__chatFixture;aw.applyAwarenessUpdate(f.project.awareness,aw.encodeAwarenessUpdate(f.remote,[f.remote.clientID]),'fixture');});
 await panel.locator('input[type=file]').setInputFiles({name:'hero-mobile.png',mimeType:'image/png',buffer:await page.evaluate(async()=>{const canvas=document.createElement('canvas');canvas.width=290;canvas.height=150;const ctx=canvas.getContext('2d')!;const gradient=ctx.createLinearGradient(0,0,290,150);gradient.addColorStop(0,'#002AFF');gradient.addColorStop(.5,'#EE00FF');gradient.addColorStop(1,'#FF001E');ctx.fillStyle=gradient;ctx.fillRect(0,0,290,150);const blob=await new Promise<Blob>(res=>canvas.toBlob(b=>res(b!)));return Array.from(new Uint8Array(await blob.arrayBuffer()));}).then(bytes=>Buffer.from(bytes))});await panel.getByRole('button',{name:'Send',exact:false}).click();await expect(panel.getByRole('img',{name:'hero-mobile.png'})).toBeVisible();
 await page.waitForTimeout(250);await page.screenshot({path:`test-results/session-chat-${theme}.png`});
 await page.evaluate(async()=>{const f=(window as any).__chatFixture;f.chat.destroy();const {setChatSession}=await import('/src/lib/collab/chatSession.ts');setChatSession(null);f.client.leave();f.remote.destroy();f.second.destroy();f.project.destroy();});await expect(page.getByTestId('chat-rail-open')).toHaveCount(0);await expect(page.getByRole('tab',{name:'Agent'})).toHaveAttribute('aria-selected','true');
});
test('cursor activity fades, hover restores, Never and other-file scope',async({page})=>{
 await session(page);const badge=page.locator('.cm-ySelectionInfo',{hasText:'Mara'}).first();await expect(badge).toBeAttached();await expect(badge).toHaveCSS('opacity','1');await page.waitForTimeout(4400);await expect(badge).toHaveCSS('opacity','0');await badge.locator('..').hover();await expect(badge).toHaveCSS('opacity','1');
 await page.evaluate(async()=>{const {setBadgeMode}=await import('/src/lib/collab/badgePolicy.ts');setBadgeMode('never');});await page.mouse.move(0,0);await expect(badge).toHaveCSS('opacity','0');
 await page.evaluate(async()=>{const aw=await import('/node_modules/.vite/deps/y-protocols_awareness.js');const f=(window as any).__chatFixture;f.remote.setLocalState({...f.remote.getLocalState(),file:'other.css'});aw.applyAwarenessUpdate(f.project.awareness,aw.encodeAwarenessUpdate(f.remote,[f.remote.clientID]),'fixture');});await expect(badge).toHaveCount(0);
});
test('closed mention toast, unread pill, image paste and chat drop never import project files',async({page})=>{
 await session(page);
 await page.evaluate(async()=>{const {setCollabEngine}=await import('/src/lib/collab/store.ts');const f=(window as any).__chatFixture;const snapshot={role:'host',state:'connected',mode:'relay',synced:true,attempt:0,guestLinks:[],localLink:null,noNetworkAddress:false,participants:f.chat.participants(),security:null,queued:0,error:null,media:null};setCollabEngine({snapshot:()=>snapshot,subscribe:()=>()=>{},startHosting:async()=>{},stopHosting:async()=>{},join:async()=>{},leave:async()=>{}});});
 await expect(page.locator('.sc-toast')).toContainText('Mara');await expect(page.locator('.collab-unread')).toHaveText('1');await page.keyboard.press('Escape');await expect(page.locator('.sc-toast')).toHaveCount(0);
 await expect(page.getByTestId('chat-rail-open')).toHaveAccessibleName('Chat, 1 unread message');await page.getByTestId('chat-rail-open').click();await expect(page.locator('.collab-unread')).toHaveCount(0);await expect(page.getByTestId('chat-rail-open')).toHaveAttribute('aria-pressed','true');
 const panel=page.getByRole('region',{name:'Session chat'}),input=panel.getByLabel('Session message');
 await input.evaluate(async el=>{const dt=new DataTransfer();const canvas=document.createElement('canvas');canvas.width=290;canvas.height=150;const context=canvas.getContext('2d')!;const gradient=context.createLinearGradient(0,0,290,150);gradient.addColorStop(0,'#002AFF');gradient.addColorStop(.5,'#EE00FF');gradient.addColorStop(1,'#FF001E');context.fillStyle=gradient;context.fillRect(0,0,290,150);const blob=await new Promise<Blob>(resolve=>canvas.toBlob(blob=>resolve(blob!)));dt.items.add(new File([blob],'hero-mobile.png',{type:'image/png'}));el.dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true}));});
 await expect(panel.getByText('hero-mobile.png',{exact:false})).toBeVisible();await panel.getByRole('button',{name:'Send',exact:false}).click();await expect(panel.getByRole('img',{name:'hero-mobile.png'})).toBeVisible();
 await panel.evaluate(el=>{const dt=new DataTransfer();dt.items.add(new File(['%PDF-1.4\nfixture'],'guide.pdf',{type:'application/pdf'}));el.dispatchEvent(new DragEvent('dragover',{dataTransfer:dt,bubbles:true,cancelable:true}));});await expect(panel.getByText('Drop here to share')).toBeVisible();
 await panel.evaluate(el=>{const dt=new DataTransfer();dt.items.add(new File(['%PDF-1.4\nfixture'],'guide.pdf',{type:'application/pdf'}));el.dispatchEvent(new DragEvent('drop',{dataTransfer:dt,bubbles:true,cancelable:true}));});await expect(panel.getByText('guide.pdf',{exact:false})).toBeVisible();await panel.getByRole('button',{name:'Send',exact:false}).click();
 expect(await page.evaluate(()=>{const f=(window as any).__chatFixture;return Object.keys(f.project.snapshot()).some(p=>p==='guide.pdf'||p==='hero-mobile.png');})).toBe(false);
});
test('same display names retain different IDs and colours; reduced motion has no fade',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});await session(page);
 await page.evaluate(async()=>{const aw=await import('/node_modules/.vite/deps/y-protocols_awareness.js'),Y=await import('/node_modules/.vite/deps/yjs.js');const f=(window as any).__chatFixture,text=f.project.files.get('index.html');const pos=Y.createRelativePositionFromTypeIndex(text,125);f.second.setLocalState({user:{name:'Mara',color:'#0F766E',participantId:'ayse'},cursor:{anchor:pos,head:pos},file:'index.html',activity:1});aw.applyAwarenessUpdate(f.project.awareness,aw.encodeAwarenessUpdate(f.second,[f.second.clientID]),'fixture');});
 await expect(page.locator('.cm-ySelectionInfo')).toHaveCount(2);const badges=page.locator('.cm-ySelectionInfo');const ids=await badges.evaluateAll(nodes=>nodes.map(n=>(n as HTMLElement).dataset.id));expect(new Set(ids).size).toBe(2);await expect(badges.first()).toHaveCSS('transition-duration','0s');
});
test('badge Settings segments, never hover, text i18n and no-focus-stealing shortcut',async({page})=>{
 await session(page);await page.getByLabel('Source code').click();await page.keyboard.press('Control+Shift+C');await expect(page.getByLabel('Source code')).toBeFocused();
 await page.evaluate(async()=>{const {setBadgeMode}=await import('/src/lib/collab/badgePolicy.ts');setBadgeMode('never');});const caret=page.locator('.cm-ySelectionCaret').first();await caret.hover();await expect(caret.locator('.cm-ySelectionInfo')).toHaveCSS('opacity','0');
 await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByRole('button',{name:'Collaboration',exact:true}).click();await expect(page.getByRole('group',{name:'Name badges'})).toBeVisible();await page.getByRole('button',{name:'Always',exact:true}).click();await expect(page.getByRole('button',{name:'Always',exact:true})).toHaveAttribute('aria-pressed','true');
 await page.keyboard.press('Escape');await page.evaluate(async()=>{const {setLocale}=await import('/src/lib/i18n.ts');setLocale('de');});await expect(page.getByRole('region',{name:'Session-Chat'}).getByText('Nur in dieser Session')).toBeVisible();await expect(page.getByRole('button',{name:'Senden',exact:false})).toBeVisible();
});

test('chat rail button: session-only, toggles, 9+ badge, AI click switches tab, shortcut',async({page})=>{
 await page.goto('/');await expect(page.getByTestId('chat-rail-open')).toHaveCount(0);
 await session(page);const chatBtn=page.getByTestId('chat-rail-open'),ai=page.getByRole('button',{name:'Open Somnia Agent'});
 await expect(chatBtn).toBeVisible();await expect(page.locator('.collab-chat-open')).toHaveCount(0);await expect(chatBtn).toHaveAttribute('aria-pressed','false');
 await page.evaluate(()=>{const f=(window as any).__chatFixture;f.chat.unread=12;f.chat.changed();});
 await expect(page.locator('.collab-unread')).toHaveText('9+');
 await chatBtn.click();await expect(page.getByRole('region',{name:'Session chat'})).toBeVisible();await expect(chatBtn).toHaveAttribute('aria-pressed','true');await expect(page.locator('.collab-unread')).toHaveCount(0);
 await ai.click();await expect(page.locator('.communication-panel')).toBeVisible();await expect(page.getByRole('tab',{name:'Agent'})).toHaveAttribute('aria-selected','true');await expect(chatBtn).toHaveAttribute('aria-pressed','false');
 await chatBtn.click();await expect(chatBtn).toHaveAttribute('aria-pressed','true');await chatBtn.click();await expect(page.locator('.communication-panel')).toHaveCount(0);
 await page.keyboard.press('Control+Alt+c');await expect(page.locator('.communication-panel')).toBeVisible();await expect(chatBtn).toHaveAttribute('aria-pressed','true');
 await page.evaluate(async()=>{const {setChatSession}=await import('/src/lib/collab/chatSession.ts');setChatSession(null);});
 await expect(chatBtn).toHaveCount(0);await expect(page.getByRole('tab',{name:'Agent'})).toHaveAttribute('aria-selected','true');
});
