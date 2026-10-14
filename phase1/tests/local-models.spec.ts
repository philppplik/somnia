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
 await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Confirm',exact:true}).click();
 await expect(page.getByRole('status')).toContainText('Complete: inventory and local verification confirmed');
 await page.getByRole('button',{name:'Remove qwen3:4b',exact:true}).click();
 await expect(page.getByRole('dialog')).toContainText('Shared blobs');
 await page.waitForTimeout(250);
 await page.screenshot({path:'/tmp/local-model-delete-review.png',fullPage:true});
 await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Confirm',exact:true}).click();
 await expect(page.getByRole('button',{name:'Remove qwen3:4b',exact:true})).toHaveCount(0);
});
test('cancelled owned transfer never claims daemon cancellation certainty',async({page})=>{
 await page.goto('/test/local-models.html?state=actions-slow');
 await page.getByRole('textbox',{name:'Exact model variant'}).fill('qwen3:4b');await page.getByRole('button',{name:'Download by name',exact:true}).click();
 await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Confirm',exact:true}).click();
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
