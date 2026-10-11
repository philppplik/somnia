import {test,expect} from './fixtures';
import {showCode} from './helpers';
const studios=['code','documents','sheets','slides','sound','video','design','vector','photos'];
// Keep unrelated update/catalog network failures out of these local diagnostics assertions.
test.beforeEach(async({page})=>{await page.route('https://**/*',route=>route.fulfill({status:200,contentType:'application/json',body:'[]'}));});

test('runtime problems from every studio survive closed panel and studio switches, reveal details, and clear only history',async({page})=>{
 await page.goto('/');await showCode(page);
 await page.evaluate(async(ids)=>{
  const {reportError,logEvent}=await import('/src/lib/log.ts');
  for(const studio of ids)reportError(studio+'.engine',new Error(studio+' decoder failed'),{context:{studio,file:studio+'.bin',codec:'unsupported',password:'do-not-display'}});
  logEvent('SOM-APP-004',{cause:new Error('Typed technical cause')});
 },studios);
 await page.getByRole('button',{name:'Toggle problems',exact:true}).click();
 for(const studio of studios)await expect(page.getByTestId('problems-studio-'+studio)).toContainText(studio+' decoder failed');
 const photo=page.getByTestId('problems-studio-photos');await photo.locator('summary').click();
 await expect(photo.locator('pre')).toContainText('unsupported');await expect(photo.locator('pre')).toContainText('[redacted]');await expect(photo).not.toContainText('do-not-display');
 await photo.getByRole('button').click();await expect(page.getByRole('radio',{name:'Somnia Photos'})).toHaveAttribute('aria-checked','true');
 for(const studio of studios)await expect(page.getByTestId('problems-studio-'+studio)).toBeVisible();
 await page.screenshot({path:'test-results/problems-runtime-all-studios.png'});
 await page.getByRole('button',{name:'Clear runtime history',exact:true}).click();
 await expect(page.getByTestId('problems-count')).toContainText('No problems');await expect(page.getByTestId('problems-empty')).toBeVisible();
 await page.getByRole('radio',{name:'Somnia Code'}).click();await showCode(page);
 await page.evaluate(async()=>{const {reportError}=await import('/src/lib/log.ts');reportError('code.fetch',new TypeError('Failed to fetch'),{context:{studio:'code',file:'styles.css',line:1,col:1}});});
 await page.getByTestId('problem-row').getByRole('button').click();await expect(page.getByRole('tab',{name:'styles.css'})).toHaveAttribute('aria-selected','true');
});

test('command boundary exposes app_command_error details but expected cancellations stay quiet',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'Toggle problems',exact:true}).click();
 await page.evaluate(async()=>{
  const {__testing,invokeCmd}=await import('/src/lib/invokeCmd.ts');
  __testing.setTransport(async()=>{throw {id:'SOM-FS-006',code:'io',message:'Disk is full',detail:'write failed at fs boundary',incident_id:'native-problem-1',expected:false};});
  await invokeCmd('log_write',{}).catch(()=>{});
  __testing.setTransport(async()=>{throw {id:'SOM-EXT-003',code:'cancelled',message:'Picker cancelled',incident_id:'',expected:true};});
  await invokeCmd('log_write',{}).catch(()=>{});__testing.setTransport(null);
 });
 await expect(page.getByTestId('problems-panel')).toContainText('Disk is full');await expect(page.getByTestId('problems-panel')).not.toContainText('Picker cancelled');
 await page.getByTestId('problem-details').locator('summary').click();await expect(page.getByTestId('problem-details')).toContainText('write failed at fs boundary');await expect(page.getByTestId('problem-details')).toContainText('SOM-FS-006');
});

test('caught fetch rejection is still visible and failed HTTP status is honest',async({page})=>{
 await page.route('**/problems-fetch-failure',route=>route.abort('failed'));
 await page.route('**/problems-http-failure',route=>route.fulfill({status:503,body:'unavailable'}));
 await page.goto('/');await page.evaluate(async()=>{await fetch('/problems-fetch-failure').catch(()=>{});await fetch('/problems-http-failure');});
 await page.getByRole('button',{name:'Toggle problems',exact:true}).click();
 await expect(page.getByTestId('problems-panel')).toContainText('Failed to fetch');await expect(page.getByTestId('problems-panel')).toContainText('HTTP 503');
});

test('real photo decode failure and sound worker error feed the global panel',async({page})=>{
 await page.goto('/');
 await page.evaluate(async()=>{const {openPhoto}=await import('/src/lib/photos/studioSession.ts');await openPhoto({name:'corrupt.png',url:'data:image/png;base64,YmFk',mime:'image/png'});});
 await page.getByRole('button',{name:'Toggle problems',exact:true}).click();await expect(page.getByTestId('problems-studio-photos')).toContainText('corrupt.png');
 await page.getByRole('radio',{name:'Somnia Sound'}).click();const chooser=page.waitForEvent('filechooser');await page.getByTestId('sound-open').click();await(await chooser).setFiles('tests/assets/arpeggio.mp3');
 await expect(page.getByTestId('sound-info')).toContainText('44100 Hz');
 await page.evaluate(async()=>{const m=await import('/src/lib/sound/session.ts');m.updateSoundSettings('arpeggio.mp3',s=>({...s,effect:{id:'not_a_plugin',keepTail:false,params:{}}}));});
 await expect(page.getByTestId('problems-studio-sound')).toContainText('unknown plugin',{timeout:20000});
});

test('invalid MP3 open is recorded in Sound without replacing current project; clearing keeps syntax',async({page})=>{
 await page.goto('/');await showCode(page);
 await page.evaluate(async()=>{const {openIncoming}=await import('/src/lib/studios/openIntake.ts');await openIncoming([{name:'broken.mp3',blob:new Blob(['invalid audio']),text:''}]);const {setSource}= (window as any).__somnia;setSource('index.html','<div><span>Broken</div>');});
 await page.getByRole('button',{name:'Toggle problems',exact:true}).click();
 await expect(page.getByTestId('problems-studio-sound')).toContainText('broken.mp3 is not a valid audio file');
 await expect(page.getByTestId('problems-panel')).toContainText('Syntax problem here');
 await page.getByRole('button',{name:'Clear runtime history',exact:true}).click();
 await expect(page.getByTestId('problems-studio-sound')).toHaveCount(0);await expect(page.getByTestId('problems-panel')).toContainText('Syntax problem here');await expect(page.locator('.cm-lint-marker-error').first()).toBeVisible();
});

test('app commands preserve thrown stack and native metadata, and aborted fetch is quiet',async({page})=>{
 await page.route('https://**/*',route=>route.fulfill({status:200,contentType:'application/json',body:'[]'}));
 await page.goto('/');await page.evaluate(async()=>{
  const {registerCommand,executeCommand}=await import('/src/lib/commands.ts');
  const stop=registerCommand({id:'test.failure',title:'Failure test',category:'Tools',run(){throw new Error('Command operation exploded');}});
  await executeCommand('test.failure');stop();
  const controller=new AbortController();controller.abort();await fetch('/aborted-test',{signal:controller.signal}).catch(()=>{});
 });
 await page.getByRole('button',{name:'Toggle problems',exact:true}).click();
 await expect(page.getByTestId('problems-panel')).toContainText('Command operation exploded');await expect(page.getByTestId('problem-row')).toHaveCount(1);
 await page.getByTestId('problem-details').locator('summary').click();await expect(page.getByTestId('problem-details')).toContainText('stack');await expect(page.getByTestId('problem-details')).toContainText('test.failure');
});

for(const [locale,clear,detail] of [['de','Laufzeitverlauf leeren','Technische Details'],['es','Borrar historial de ejecución','Detalles técnicos'],['fr',"Effacer l’historique d’exécution",'Détails techniques'],['pt-BR','Limpar histórico de execução','Detalhes técnicos']] as const)test(`runtime panel localizes its controls in ${locale}`,async({page})=>{
 await page.addInitScript(tag=>localStorage.setItem('somnia.locale.v1',tag),locale);
 await page.goto('/');await page.evaluate(async()=>{const {patch}= (window as any).__somnia;patch({problemsOpen:true});const {reportError}=await import('/src/lib/log.ts');reportError('photos.engine',new Error('PNG decoder failed'),{context:{studio:'photos'}});});
 await expect(page.getByTestId('problems-panel').getByRole('button',{name:clear,exact:true})).toBeVisible();await expect(page.getByTestId('problems-studio-photos').locator('summary')).toHaveText(detail);
});
