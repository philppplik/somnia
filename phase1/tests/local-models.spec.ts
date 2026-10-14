import {test,expect} from '@playwright/test';
test('Local tab shows exact variants, advertised capability and remote provenance',async({page})=>{
 await page.goto('/test/local-models.html');
 await expect(page.getByText('qwen3:4b',{exact:true}).first()).toBeVisible();
 await expect(page.getByText('Remote-backed',{exact:true})).toBeVisible();
 await expect(page.getByText('Vision',{exact:true}).first()).toBeVisible();
 await expect(page.getByRole('button',{name:'Refresh',exact:true}).first()).toBeEnabled();
});
test('shared five-tab keyboard navigates every tab and wraps',async({page})=>{
 await page.goto('/test/local-models.html');const tabs=page.getByRole('tab');
 await tabs.nth(0).focus();
 for(const index of [1,2,3,4,0]){await page.keyboard.press('ArrowRight');await expect(tabs.nth(index)).toBeFocused();await expect(tabs.nth(index)).toHaveAttribute('aria-selected','true');}
 await page.keyboard.press('End');await expect(tabs.nth(4)).toBeFocused();
 await page.keyboard.press('Home');await expect(tabs.nth(0)).toBeFocused();
 await page.keyboard.press('ArrowLeft');await expect(tabs.nth(4)).toBeFocused();
});
test('empty inventory and malformed inventory have different states',async({page})=>{
 await page.goto('/test/local-models.html?state=empty');await expect(page.getByText('No models installed.',{exact:true})).toBeVisible();
 await page.goto('/test/local-models.html?state=malformed');await expect(page.getByRole('alert')).toContainText('Could not read model inventory');
});
test('local model fixture stays readable at narrow widths and dark theme',async({page})=>{
 await page.goto('/test/local-models.html');await expect(page.getByRole('button',{name:'Refresh',exact:true}).first()).toBeEnabled();
 await expect(page.getByText('Fixture GPU:',{exact:false})).toBeVisible();
 await page.evaluate(()=>document.documentElement.setAttribute('data-theme','light'));
 await page.screenshot({path:'/tmp/local-models-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});
 await page.evaluate(()=>document.documentElement.setAttribute('data-theme','dark'));
 await expect(page.getByText('qwen3:4b',{exact:true}).first()).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBeTruthy();
 await page.screenshot({path:'/tmp/local-models-narrow.png',fullPage:true});
});
test('model download and removal require review and reconcile their results',async({page})=>{
 await page.goto('/test/local-models.html?state=actions');
 await page.getByRole('textbox',{name:'Exact model variant'}).fill('qwen3:4b');
 await page.getByRole('button',{name:'Download by name',exact:true}).click();
 await expect(page.getByRole('dialog')).toContainText('License, download size and free storage are not checked');
 await expect(page.getByRole('button',{name:'Confirm',exact:true})).toBeDisabled();
 if(await page.getByRole('dialog').getByRole('button',{name:'Select actual Ollama model folder',exact:true}).count())await page.getByRole('dialog').getByRole('button',{name:'Select actual Ollama model folder',exact:true}).click();await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Confirm',exact:true}).click();
 await expect(page.getByRole('status')).toContainText('Complete: inventory and local verification confirmed');
 await page.getByRole('button',{name:'Remove qwen3:4b',exact:true}).click();
 await expect(page.getByRole('dialog')).toContainText('Shared blobs');
 await page.waitForTimeout(250);
 await page.screenshot({path:'/tmp/local-model-delete-review.png',fullPage:true});
 if(await page.getByRole('dialog').getByRole('button',{name:'Select actual Ollama model folder',exact:true}).count())await page.getByRole('dialog').getByRole('button',{name:'Select actual Ollama model folder',exact:true}).click();await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Confirm',exact:true}).click();
 await expect(page.getByRole('button',{name:'Remove qwen3:4b',exact:true})).toHaveCount(0);
});
test('cancelled owned transfer never claims daemon cancellation certainty',async({page})=>{
 await page.goto('/test/local-models.html?state=actions-slow');
 await page.getByRole('textbox',{name:'Exact model variant'}).fill('qwen3:4b');await page.getByRole('button',{name:'Download by name',exact:true}).click();
 if(await page.getByRole('dialog').getByRole('button',{name:'Select actual Ollama model folder',exact:true}).count())await page.getByRole('dialog').getByRole('button',{name:'Select actual Ollama model folder',exact:true}).click();await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Confirm',exact:true}).click();
 await page.getByRole('status').getByRole('button',{name:'Cancel',exact:true}).click();
 await expect(page.getByRole('status')).toContainText('Daemon cancellation is unknown');
 await page.screenshot({path:'/tmp/local-model-cancel-unknown.png',fullPage:true});
});
test('hardware fit remains an estimate and daemon residency reports actual size_vram',async({page})=>{
 await page.goto('/test/local-models.html');
 await expect(page.getByText('Fixture GPU:',{exact:false})).toBeVisible();
 await expect(page.getByText('Loaded: daemon reports 2 GiB in VRAM',{exact:false})).toBeVisible();
 await expect(page.getByText('Model storage volume/free space: not checked',{exact:true})).toBeVisible();
 await expect(page.getByText('Image input adapter not enabled',{exact:false})).toBeVisible();
});
test('advanced runtime options expose requested values and daemon-default limits',async({page})=>{
 await page.goto('/test/local-models.html?state=advanced');await page.getByText('Advanced runtime settings',{exact:true}).click();
 await expect(page.getByRole('spinbutton',{name:'Requested context tokens (blank: daemon default)'})).toHaveValue('16384');
 await expect(page.getByText('Draft until Save.',{exact:false})).toBeVisible();
 await page.screenshot({path:'/tmp/local-runtime-advanced.png',fullPage:true});
});
test('alternate runtimes are inspect-only with no inferred local execution',async({page})=>{
 await page.goto('/test/local-models.html');await page.getByText('Other local runtimes: inspect only',{exact:true}).click();
 await expect(page.getByText('Metadata only. Loopback is not proof of local inference.',{exact:false})).toBeVisible();
 await page.getByRole('button',{name:'Inspect metadata',exact:true}).click();
 await expect(page.getByRole('alert')).toContainText('requires desktop');
 await page.screenshot({path:'/tmp/local-runtime-discovery.png',fullPage:true});
});
test('vision file disclosure is explicit and disabled until opt-in',async({page})=>{
 await page.goto('/test/local-models.html?state=vision');await page.getByText('Describe a local image (opt-in)',{exact:true}).click();
 await expect(page.getByRole('button',{name:'Describe selected image',exact:true})).toBeDisabled();
 await expect(page.getByRole('checkbox')).not.toBeChecked();
 await expect(page.getByText('No tools, canvas capture, cloud fallback, image history or auto-apply.',{exact:false})).toBeVisible();
 await page.screenshot({path:'/tmp/local-vision-opt-in.png',fullPage:true});
});
test('quality probes are opt-in synthetic tests with no quality guarantee',async({page})=>{
 await page.goto('/test/local-models.html?state=probes');await page.getByText('Opt-in local quality probes',{exact:true}).click();
 await expect(page.getByText('A pass is a probe result, never a quality guarantee.',{exact:false})).toBeVisible();
 await expect(page.getByRole('button',{name:'Run tool probe',exact:true})).toBeVisible();
 await expect(page.getByRole('img')).toHaveCount(3);
 await page.screenshot({path:'/tmp/local-quality-probes.png',fullPage:true});
});
test('local vision description previews, accepts and undoes a studio source edit',async({page})=>{
 await page.goto('/test/local-models.html?state=apply');
 await page.getByRole('button',{name:'Preview as text',exact:true}).click();
 await expect(page.getByRole('region',{name:'Review native AI proposal'})).toContainText('A red square on a white background.');
 await page.screenshot({path:'/tmp/local-vision-apply-review.png',fullPage:true});
 await page.getByRole('button',{name:'Accept preview',exact:true}).click();await expect(page.getByRole('status')).toContainText('Applied to editor, not saved.');
 await page.getByRole('button',{name:'Undo image description',exact:true}).click();await expect(page.getByRole('status')).toContainText('Image description undone.');
 await page.getByText('Local tool schema compatibility',{exact:true}).click();await expect(page.getByText('Schema references are not supported',{exact:true})).toBeVisible();await page.screenshot({path:'/tmp/local-tool-schema-reasons.png',fullPage:true});
});
test('local health separates daemon reachability from internet offline and rechecks hidden errors',async({page})=>{
 await page.goto('/test/local-models.html?state=health');const health=page.getByRole('region',{name:'Local AI status'});
 await expect(health).toContainText('Installed models: unknown');await expect(health.getByRole('alert')).toContainText('Daemon unreachable; installation unknown');
 await health.getByRole('button',{name:'Hide these errors',exact:true}).click();await expect(health.getByRole('alert')).toHaveCount(0);await expect(health).toContainText('Status errors hidden.');
 await page.evaluate(()=>{Object.defineProperty(navigator,'onLine',{value:false,configurable:true});window.dispatchEvent(new Event('offline'));});await expect(health).toContainText('Local inference may still work');
 await health.getByRole('button',{name:'Refresh',exact:true}).click();await expect(health).toContainText('Reachable on this computer');await expect(health).toContainText('Installed models: 0');await page.screenshot({path:'/tmp/local-ai-health.png',fullPage:true});
});
test('new application and schema reasons controls translate into German',async({page})=>{
 await page.goto('/test/local-models.html?state=apply&locale=de');await expect(page.getByRole('button',{name:'Vorschau als Text',exact:true})).toBeVisible();await page.getByText('Lokale Werkzeug-Schemakompatibilität',{exact:true}).click();await expect(page.getByText('Schemareferenzen werden nicht unterstützt',{exact:true})).toBeVisible();await page.screenshot({path:'/tmp/local-ai-controls-de.png',fullPage:true});
});
test('health panel follows owned pull progress with current-layer bytes only',async({page})=>{
 await page.goto('/test/local-models.html?state=health-pull');const health=page.getByRole('region',{name:'Local AI status'});
 await expect(health.getByRole('status')).toContainText('Download: qwen3:4b');await expect(health.getByRole('status')).toContainText('500 / 1000 bytes in current layer; no overall percentage.');await page.screenshot({path:'/tmp/local-ai-pull-status.png',fullPage:true});
 await expect(health.getByRole('status')).toContainText('Complete: inventory and local verification confirmed');
});
for(const kind of ['interface','animation','3d'])test(`local ${kind} metadata suggestions require opt-in and native review/undo`,async({page})=>{
 let requests=0;await page.route('http://127.0.0.1:11434/api/show',r=>r.fulfill({json:{model_info:{architecture:'fixture'},capabilities:['completion']}}));await page.route('http://127.0.0.1:11434/api/chat',r=>{const body=r.request().postDataJSON();expect(body.tools??[]).toEqual([]);expect(body.messages[0].images).toBeUndefined();requests++;return r.fulfill({contentType:'application/x-ndjson',body:JSON.stringify({message:{content:kind==='animation'?'Accent shape':'A structured scene description.'},done:true,done_reason:'stop'})+'\n'});});
 await page.goto('/test/local-models.html?state=studio-'+kind);await page.getByText('Local studio suggestions',{exact:true}).click();await expect(page.getByRole('button',{name:'Suggest from metadata',exact:true})).toBeDisabled();await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Suggest from metadata',exact:true}).click();
 const review=page.getByRole('region',{name:'Review local studio proposal'});await expect(review).toContainText('After');await page.screenshot({path:`/tmp/local-studio-${kind}-review.png`,fullPage:true});await review.getByRole('button',{name:'Accept suggestion',exact:true}).click();await review.getByRole('button',{name:'Undo suggestion',exact:true}).click();await expect(review).toContainText('Suggestion undone.');expect(requests).toBe(1);
});
for(const [locale,label] of [['es','Vista previa como texto'],['fr','Aperçu comme texte'],['pt-BR','Prévia como texto']])test(`Local controls translated for ${locale}`,async({page})=>{
 await page.goto('/test/local-models.html?state=apply&locale='+locale);await page.evaluate(async tag=>{const {setLocale}=await import('/src/lib/i18n.ts');setLocale(tag);},locale);await expect(page.getByRole('button',{name:label,exact:true})).toBeVisible();
});
test('Interface local image alt uses prepared image without assets or URLs in prompt, then undo',async({page})=>{
 await page.route('http://127.0.0.1:11434/api/show',r=>r.fulfill({json:{model_info:{architecture:'fixture'},capabilities:['completion','vision']}}));
 await page.route('http://127.0.0.1:11434/api/chat',r=>{const body=r.request().postDataJSON();expect(body.messages[0].images).toHaveLength(1);expect(body.messages[0].content).not.toContain('data:image');expect(body.messages[0].content).not.toContain('synthetic.png');return r.fulfill({contentType:'application/x-ndjson',body:JSON.stringify({message:{content:'A red square.'},done:true,done_reason:'stop'})+'\n'});});
 await page.goto('/test/local-models.html?state=studio-image');await page.getByText('Local studio suggestions',{exact:true}).click();await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Suggest image alt text',exact:true}).click();
 const review=page.getByRole('region',{name:'Review local studio proposal'});await expect(review).toContainText('A red square.');await review.getByRole('button',{name:'Accept suggestion',exact:true}).click();
 expect(await page.evaluate(async()=>{const {interfaceSession}=await import('/src/lib/interface/session.ts');return interfaceSession.get().document!.nodes[0].altText;})).toBe('A red square.');
 await review.getByRole('button',{name:'Undo suggestion',exact:true}).click();expect(await page.evaluate(async()=>{const {interfaceSession}=await import('/src/lib/interface/session.ts');return interfaceSession.get().document!.nodes[0].altText;})).toBeUndefined();
});
test('recommended candidates by task open existing review, never start a transfer on selection',async({page})=>{
 await page.goto('/test/local-models.html?state=actions');await page.getByText('Recommended model candidates by task',{exact:true}).click();await page.getByRole('combobox',{name:'Task',exact:true}).selectOption('vision');await expect(page.getByRole('button',{name:'Review download gemma3:4b',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Review download qwen3:4b',exact:true})).toHaveCount(0);await page.getByRole('button',{name:'Review download gemma3:4b',exact:true}).click();const dialog=page.getByRole('dialog');await expect(dialog).toContainText('gemma3:4b');await expect(dialog.getByRole('button',{name:'Confirm',exact:true})).toBeDisabled();await page.screenshot({path:'/tmp/local-model-task-picker.png',fullPage:true});await dialog.getByRole('button',{name:'Cancel',exact:true}).click();
});
test('first-run missing Ollama guide is links/instructions only, not proof of absence or auto-install',async({page})=>{
 await page.goto('/test/local-models.html?state=not-found');const guide=page.getByRole('region',{name:'Set up local AI'});await expect(guide).toContainText('This is not proof that it is absent');await expect(guide.getByRole('link',{name:'Ollama installation guide'})).toHaveAttribute('href','https://ollama.com/download');await expect(guide.getByRole('link',{name:'Official Linux guide'})).toHaveAttribute('href','https://docs.ollama.com/linux');await expect(guide.getByRole('button')).toHaveCount(1);await page.screenshot({path:'/tmp/local-ai-first-run.png',fullPage:true});
});
test('voice preparation is disabled without approved STT, no fake production transcription',async({page})=>{
 await page.goto('/test/local-models.html?state=voice-unavailable');await page.getByText('Local voice input preparation',{exact:true}).click();await expect(page.getByText('No approved local STT helper or model is installed.',{exact:false})).toBeVisible();await page.getByRole('checkbox').check();await expect(page.getByRole('button',{name:'Hold to talk',exact:true})).toBeDisabled();
});
test('test-only voice adapter records on hold, reviews editable transcript and inserts with undo',async({page})=>{
 await page.goto('/test/local-models.html?state=voice-test');await page.getByText('Local voice input preparation',{exact:true}).click();await expect(page.getByRole('button',{name:'Hold to talk',exact:true})).toBeDisabled();await page.getByRole('checkbox').check();const talk=page.getByRole('button',{name:'Hold to talk',exact:true});await talk.focus();await page.keyboard.down('Space');await expect(page.getByRole('status')).toContainText('Recording, maximum two minutes');await expect(page.getByRole('meter')).toHaveAttribute('value','0.5');await page.screenshot({path:'/tmp/local-voice-capture.png',fullPage:true});await page.keyboard.up('Space');await expect(page.getByRole('textbox',{name:'Edit transcript before insertion'})).toHaveValue('Synthetic test transcript');await page.getByRole('textbox',{name:'Edit transcript before insertion'}).fill('Edited review transcript');await page.getByRole('button',{name:'Preview transcript insertion',exact:true}).click();await expect(page.getByRole('region',{name:'Review native AI proposal'})).toContainText('Edited review transcript');await page.screenshot({path:'/tmp/local-voice-transcript-review.png',fullPage:true});await page.getByRole('button',{name:'Accept preview',exact:true}).click();await page.getByRole('button',{name:'Undo transcript insertion',exact:true}).click();await expect(page.getByRole('status')).toContainText('Transcript insertion undone');
});

test('native STT readiness fails closed and model download has exact review',async({page})=>{
 await page.goto('/test/local-models.html?state=native-missing');await page.getByRole('button',{name:'Inspect local STT readiness',exact:true}).click();await expect(page.getByText('No verified helper packaged in this build',{exact:true})).toBeVisible();await page.getByText('Local voice input preparation',{exact:true}).click();await expect(page.getByRole('button',{name:'Hold to talk',exact:true})).toBeDisabled();await page.getByRole('button',{name:'Review optional model download',exact:true}).click();const dialog=page.getByRole('dialog');await expect(dialog).toContainText('147951465 bytes');await expect(dialog).toContainText('60ed5bc3dd14eea856493d334349b405782ddcaf0028d4b5df4088345fba2efe');await expect(dialog.getByRole('button',{name:'Confirm',exact:true})).toBeDisabled();await page.screenshot({path:'/tmp/local-voice-model-review.png',fullPage:true});await dialog.getByRole('button',{name:'Cancel',exact:true}).click();await expect(dialog).not.toBeVisible();
});
test('native fixture requires acknowledgment, cancelled download does not grant readiness',async({page})=>{
 await page.goto('/test/local-models.html?state=native-slow');await page.getByRole('button',{name:'Inspect local STT readiness',exact:true}).click();await page.getByRole('button',{name:'Review optional model download',exact:true}).click();const dialog=page.getByRole('dialog');if(await dialog.getByRole('button',{name:'Select actual Ollama model folder',exact:true}).count())await dialog.getByRole('button',{name:'Select actual Ollama model folder',exact:true}).click();await dialog.getByRole('checkbox').check();await dialog.getByRole('button',{name:'Confirm',exact:true}).click();await expect(page.getByRole('status')).toContainText('downloading');await page.getByRole('button',{name:'Cancel',exact:true}).click();await expect(page.getByRole('button',{name:'Inspect local STT readiness',exact:true})).toBeEnabled();await page.getByText('Local voice input preparation',{exact:true}).click();await expect(page.getByRole('button',{name:'Hold to talk',exact:true})).toBeDisabled();
});
test('native review wraps artifact identity at phone width and ready fixture still needs mic consent',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.goto('/test/local-models.html?state=native-ready');await page.getByRole('button',{name:'Inspect local STT readiness',exact:true}).click();await expect(page.getByText('Pinned helper verified for this build',{exact:true})).toBeVisible();await page.getByText('Local voice input preparation',{exact:true}).click();await expect(page.getByRole('button',{name:'Hold to talk',exact:true})).toBeDisabled();await expect(page.getByRole('button',{name:'Review optional model download',exact:true})).toBeDisabled();
 await page.goto('/test/local-models.html?state=native-missing');await page.getByRole('button',{name:'Inspect local STT readiness',exact:true}).click();await page.getByRole('button',{name:'Review optional model download',exact:true}).click();await expect(page.getByRole('dialog')).toBeVisible();await page.screenshot({path:'/tmp/local-voice-model-review-narrow.png',fullPage:true});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('synthetic Ollama transport streams into chat and Stop preserves incomplete text via StudioStatus',async({page})=>{
 await page.goto('/test/local-models.html?state=stream-local');await page.getByRole('button',{name:'Start synthetic stream',exact:true}).click();await expect(page.locator('p[aria-busy=true]')).toContainText('Synthetic incremental response');await page.getByRole('button',{name:'Stop synthetic stream',exact:true}).click();await expect(page.getByText('Stopped - partial response',{exact:true})).toBeVisible();await expect(page.locator('p[aria-busy=false]')).toContainText('Synthetic incremental response');await page.screenshot({path:'/tmp/local-ollama-stream-stopped.png',fullPage:true});
});
test('model pull requires selected volume and insufficient estimate remains blocked after acknowledgment',async({page})=>{
 await page.goto('/test/local-models.html?state=actions-disk-low');await page.getByRole('textbox',{name:'Exact model variant'}).fill('qwen3:4b');await page.getByRole('button',{name:'Download by name',exact:true}).click();const dialog=page.getByRole('dialog');await dialog.getByRole('checkbox').check();await expect(dialog.getByRole('button',{name:'Confirm',exact:true})).toBeDisabled();await dialog.getByRole('button',{name:'Select actual Ollama model folder',exact:true}).click();await expect(dialog).toContainText('Insufficient estimated capacity');await expect(dialog.getByRole('button',{name:'Confirm',exact:true})).toBeDisabled();await page.screenshot({path:'/tmp/local-model-disk-review.png',fullPage:true});
});
test('model-specific context is an explicit draft field, not auto-applied capacity',async({page})=>{
 await page.goto('/test/local-models.html?state=advanced');await page.getByText('Advanced runtime settings',{exact:true}).click();const input=page.getByRole('spinbutton',{name:'Requested context for qwen3:4b'});await expect(input).toHaveValue('');await expect(page.getByText('Per-model requested context overrides the global value on the next saved run.',{exact:false})).toBeVisible();
});
