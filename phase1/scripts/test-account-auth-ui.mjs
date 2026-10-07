import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {chromium} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
const base='http://127.0.0.1:1420';
test('account UI contract, lifecycle, safe errors, explicit fallback and pixels',async()=>{
 const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1'],{stdio:'ignore'});let browser;
 try{
  for(let i=0;i<100;i++){try{if((await fetch(base)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
  browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',args:['--no-sandbox']});
  const page=await browser.newPage({viewport:{width:1440,height:1000}});page.setDefaultTimeout(8000);
  await page.addInitScript(()=>{localStorage.setItem('somnia.welcome.seen.v1','11.2.0-beta.1');localStorage.setItem('somnia.locale.v1','en');});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route(/https:\/\/(api\.openai\.com|auth\.openai\.com)/,()=>assert.fail('No real cloud request allowed'));
  await page.goto(base);await page.getByRole('button',{name:'Open Somnia Agent',exact:true}).click();
  const panel=page.getByRole('complementary',{name:'Somnia Agent'});
  await panel.getByRole('button',{name:'Agent configuration',exact:true}).click();
  const settings=page.getByRole('dialog');await settings.getByRole('combobox',{name:/^Provider/}).selectOption('openai');
  const account=settings.locator('.provider-account');assert.equal(await account.getByRole('button',{name:'Connect account',exact:true}).isEnabled(),false);
  await page.evaluate(()=>{
   globalThis.isTauri=true;window.authFixture={provider:'openai',state:'disconnected',method:'api-key'};window.authCalls=[];
   window.__TAURI_INTERNALS__={invoke:async(command,args)=>{
    window.authCalls.push({command,args});
    if(window.authFailure&&command.startsWith('agent_account_'))throw Error('sensitive-secret-must-not-render');
    if(command==='agent_key_status')return true;
    if(command==='agent_account_start')window.authFixture.state='pending';
    if(command==='agent_account_cancel'||command==='agent_account_disconnect')window.authFixture.state='disconnected';
    if(command==='agent_account_set_method')window.authFixture.method=args.method;
    if(command.startsWith('agent_account_'))return {...window.authFixture,token:'sensitive-token'};
    throw Error('unexpected fixture command '+command);
   }};
  });
  await settings.getByRole('combobox',{name:/^Provider/}).selectOption('openrouter');await settings.getByRole('combobox',{name:/^Provider/}).selectOption('openai');
  await account.getByText('Not connected',{exact:true}).waitFor();
  await account.getByRole('button',{name:'Connect account',exact:true}).click();await account.getByText('Waiting for sign-in',{exact:true}).waitFor();
  assert.equal(await settings.getByRole('button',{name:'Test saved key',exact:true}).isEnabled(),true);
  await account.getByRole('button',{name:'Cancel sign-in'}).click();await account.getByText('Not connected',{exact:true}).waitFor();
  await account.getByRole('button',{name:'Connect account',exact:true}).click();await account.getByText('Waiting for sign-in',{exact:true}).waitFor();
  await page.evaluate(()=>{window.authFixture={provider:'openai',state:'connected',method:'account',expiresAt:Date.now()+600000};});
  await account.getByText('Connected',{exact:true}).waitFor();
  await mkdir('/downloads/auth-ui',{recursive:true});
  await account.scrollIntoViewIfNeeded();await page.screenshot({path:'/downloads/auth-ui/connected-light.png'});
  await account.getByRole('combobox',{name:/^Use for AI requests/}).selectOption('api-key');
  assert.ok(await page.evaluate(()=>window.authCalls.some(c=>c.command==='agent_account_set_method'&&c.args.method==='api-key')));
  await page.evaluate(()=>{window.authFixture.state='expired';window.authFixture.method='account';window.dispatchEvent(new Event('somnia:agent-account-changed'));});
  await account.getByText('Expired - reconnect',{exact:true}).waitFor();await page.screenshot({path:'/downloads/auth-ui/expired-light.png'});
  await account.getByRole('button',{name:'Disconnect',exact:true}).click();await account.getByText('Not connected',{exact:true}).waitFor();
  await page.evaluate(()=>{window.authFailure=true;});await account.getByRole('button',{name:'Connect account',exact:true}).click();await account.getByRole('alert').waitFor();
  assert.ok(!(await settings.textContent()).includes('sensitive-'));assert.ok(!(await page.evaluate(()=>JSON.stringify({...localStorage}))).includes('sensitive-'));
  await page.evaluate(()=>{window.authFailure=false;window.authFixture.state='connected';window.authFixture.method='account';});
  await page.evaluate(async()=>{globalThis.isTauri=false;const m=await import('/src/lib/agent/settingsRuntime.ts');await m.applyAgentSettings({...m.agentSettingsSnapshot().config,provider:'openai',model:'fixture-model'});globalThis.isTauri=true;window.dispatchEvent(new Event('somnia:agent-account-changed'));});
  await settings.getByRole('button',{name:'Close settings',exact:true}).click();await panel.locator('.agent-account-summary').getByText('OpenAI: Connected',{exact:true}).waitFor();await page.screenshot({path:'/downloads/auth-ui/agent-connected.png'});
  await panel.getByRole('button',{name:'Manage connection'}).click();await settings.getByRole('tab',{name:'Providers & models',exact:true}).waitFor();
  await page.evaluate(()=>{document.documentElement.dataset.theme='dark';});await page.setViewportSize({width:820,height:900});await account.scrollIntoViewIfNeeded();await page.screenshot({path:'/downloads/auth-ui/connected-dark-narrow.png'});
  for(const locale of ['de','es','fr','pt-BR']){
   await page.evaluate(async loc=>{const m=await import('/src/lib/i18n.ts');m.setLocale(loc);},locale);
   assert.equal(await account.getByRole('button',{name:/./}).count(),2);
  }
  assert.deepEqual(errors,[]);
 }finally{await browser?.close();server.kill('SIGTERM');}
});
