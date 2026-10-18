import {createServer} from 'vite';import {chromium} from 'playwright';import assert from 'node:assert/strict';
const server=await createServer({server:{port:1427,strictPort:true},define:{'import.meta.env.VITE_LOCAL_VOICE_PREVIEW':JSON.stringify('true')}});await server.listen();
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
try{
 const page=await browser.newPage({viewport:{width:1280,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://localhost:1427/test/transcript/');await page.getByText('Local voice preview is not available in this build.').waitFor();assert.equal(await page.getByRole('button',{name:'Transcribe file',exact:true}).isDisabled(),true);await page.screenshot({path:'/downloads/transcript-hub-unavailable.png'});
 await page.goto('http://localhost:1427/test/transcript/?native');await page.getByText('Local helper and model are ready.').waitFor();
 const buffer=Buffer.alloc(44+3200);buffer.write('RIFF');buffer.writeUInt32LE(buffer.length-8,4);buffer.write('WAVEfmt ',8);buffer.writeUInt32LE(16,16);buffer.writeUInt16LE(1,20);buffer.writeUInt16LE(1,22);buffer.writeUInt32LE(16000,24);buffer.writeUInt32LE(32000,28);buffer.writeUInt16LE(2,32);buffer.writeUInt16LE(16,34);buffer.write('data',36);buffer.writeUInt32LE(3200,40);
 await page.getByLabel('Audio file',{exact:true}).setInputFiles({name:'synthetic.wav',mimeType:'audio/wav',buffer});await page.getByRole('button',{name:'Transcribe file',exact:true}).click();await page.getByText('Transcript ready. Review before use.').waitFor();assert.match(await page.getByRole('textbox').inputValue(),/Synthetic fixture/);await page.screenshot({path:'/downloads/transcript-hub-result.png'});
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'Export TXT'}).click();assert.equal((await download).suggestedFilename(),'synthetic.txt');
 await page.getByRole('button',{name:'Clear',exact:true}).click();assert.equal(await page.getByRole('textbox').inputValue(),'');assert.equal(await page.getByRole('button',{name:'Export TXT'}).isDisabled(),true);assert.deepEqual(errors,[]);console.log('Transcript Hub browser checks passed: disabled unavailable build, actual WAV decode, synthetic IPC result, TXT export, clear.');
}finally{await browser.close();await server.close();}
