import {test,expect} from './fixtures';
test.use({sample:false});
test('empty studio sidebar follows studio and provides chat-only guidance without stale context',async({page})=>{
 await page.route('http://127.0.0.1:11434/api/show',r=>r.fulfill({json:{model_info:{architecture:'fixture'}}}));
 let payload:Record<string,unknown>|undefined;
 await page.route('http://127.0.0.1:11434/api/chat',async r=>{payload=r.request().postDataJSON();await r.fulfill({contentType:'application/x-ndjson',body:JSON.stringify({message:{content:'Start with a short rough cut, then refine the pacing.'},done:true})+'\n'});});
 await page.goto('/');await page.getByRole('radio',{name:'Somnia Video',exact:true}).click();await page.getByRole('button',{name:'Open Somnia Agent'}).click();
 const panel=page.getByRole('complementary',{name:'Somnia Agent'});
 await expect(panel.locator('.ag-context-chip')).toContainText('Video: No document');
 await panel.getByRole('button',{name:'Suggest pacing improvements',exact:true}).click();await expect(panel.getByLabel('Message to Somnia Agent')).toHaveValue('Suggest pacing improvements');
 await panel.getByRole('button',{name:'Agent configuration',exact:true}).click();const settings=page.getByRole('dialog');await settings.getByLabel('Model',{exact:true}).fill('fixture-local');await settings.getByRole('button',{name:'Save AI settings',exact:true}).click();await settings.getByText('Configuration saved.',{exact:true}).waitFor();await settings.getByRole('button',{name:'Close settings',exact:true}).click();
 await page.screenshot({path:'tests/artifacts/wave7-video-sidebar.png'});
 await panel.getByRole('button',{name:'Send',exact:true}).click();await expect(panel.getByText('Start with a short rough cut, then refine the pacing.',{exact:false})).toBeVisible();
 expect((payload?.tools as unknown[]|undefined)??[]).toHaveLength(0);expect(JSON.stringify(payload)).not.toContain('Untrusted active document context');
 await expect(panel.locator('.ag-review')).toHaveCount(0);
 await panel.getByRole('button',{name:'New chat'}).click();await page.getByRole('radio',{name:'Somnia Sound',exact:true}).click();await expect(panel.getByRole('button',{name:'Explain the current sound settings'})).toBeVisible();await expect(panel.locator('.ag-context-chip')).toContainText('Sounds: No document');
 await page.screenshot({path:'tests/artifacts/wave7-sound-sidebar.png'});
});

test('Sound reaches the real panel review, applies only after acceptance, and guarded undo restores',async({page})=>{
 await page.route('http://127.0.0.1:11434/api/show',r=>r.fulfill({json:{model_info:{architecture:'fixture'}}}));let rounds=0;
 await page.route('http://127.0.0.1:11434/api/chat',async r=>{const payload=r.request().postDataJSON();expect(JSON.stringify(payload)).not.toContain('blob:');const message=++rounds===1?{content:'Review this fade.',tool_calls:[{function:{name:'sound_propose_settings',arguments:{settings:{fadeInMs:200,fadeOutMs:300}}}}]}:{content:'These settings are staged, not applied.'};await r.fulfill({contentType:'application/x-ndjson',body:JSON.stringify({message,done:true})+'\n'});});
 await page.goto('/');
 await page.evaluate(async()=>{
  // @ts-ignore Dev-server modules used only by the browser fixture.
  const media=await import('/src/lib/media.ts'),sound=await import('/src/lib/sound/session.ts');
  const fake={async init(){return [];},async process(){return {wav:new ArrayBuffer(44),peaks:new Float32Array(4),report:{format:'Wav',input:{frames:441000,sample_rate:44100,channels:2,duration_s:10,peak_db:-3,rms_db:-12},output:{frames:441000,sample_rate:44100,channels:2,duration_s:10,peak_db:-3,rms_db:-12},trimmed_range:null,steps:[],wav_bytes:44},ms:1};},dispose(){}};
  sound.setSoundEngineFactory(()=>fake as never);await media.addMediaFile(new File([new Uint8Array([0x49,0x44,0x33,3,0,0,0,0,0,0,...new Array(40).fill(0)])],'fixture.mp3',{type:'audio/mpeg'}),'fixture.mp3');await sound.openSound(media.getMedia().items[0]);
 });
 await page.getByRole('radio',{name:'Somnia Sound',exact:true}).click();await page.getByRole('button',{name:'Open Somnia Agent'}).click();const panel=page.getByRole('complementary',{name:'Somnia Agent'});
 await panel.getByRole('button',{name:'Agent configuration',exact:true}).click();const settings=page.getByRole('dialog');await settings.getByLabel('Model',{exact:true}).fill('fixture-local');await settings.getByRole('button',{name:'Save AI settings',exact:true}).click();await settings.getByText('Configuration saved.',{exact:true}).waitFor();await settings.getByRole('button',{name:'Close settings',exact:true}).click();
 await panel.getByRole('checkbox',{name:/Allow inspecting/}).check();await panel.getByLabel('Message to Somnia Agent').fill('Suggest fades');await panel.getByRole('button',{name:'Send',exact:true}).click();
 await expect(panel.getByRole('region',{name:'Review native AI proposal'})).toBeVisible();
 // @ts-ignore Dev-server module used only by the browser fixture.
 await expect(panel.getByLabel('Settings changes')).toContainText('Fade in: 0 ms → 200 ms');
 // @ts-ignore Dev-server module used only by the browser fixture.
 const read=()=>page.evaluate(async()=>{const s=await import('/src/lib/sound/session.ts');return s.getSoundSession('fixture.mp3')!.settings.fadeInMs;});expect(await read()).toBe(0);
 await page.screenshot({path:'tests/artifacts/wave7-sound-review.png'});
 await panel.getByRole('button',{name:'Accept preview',exact:true}).click();await expect(panel.getByText('Applied to studio memory, not saved.',{exact:false})).toBeVisible();expect(await read()).toBe(200);
 await panel.getByRole('button',{name:'Undo AI transaction',exact:true}).click();await expect(panel.getByText('AI transaction undone. Nothing saved.')).toBeVisible();expect(await read()).toBe(0);
});
