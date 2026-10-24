import {test,expect} from '@playwright/test';
import path from 'node:path';
import {readFileSync} from 'node:fs';
test('repro: drag pptx into code studio',async({page})=>{
  const errors:string[]=[];
  page.on('pageerror',e=>errors.push('PAGEERROR: '+e.message));
  await page.goto('/');
  const buf=readFileSync('slides-engine/fixtures/independent.pptx');
  const handle=await page.evaluateHandle(async(b64)=>{
    const dt=new DataTransfer();
    const bin=atob(b64);const bytes=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i);
    dt.items.add(new File([bytes],'independent.pptx',{type:'application/vnd.openxmlformats-officedocument.presentationml.presentation'}));
    return dt;
  },buf.toString('base64'));
  await page.locator('body').dispatchEvent('dragover',{dataTransfer:handle});
  await page.locator('body').dispatchEvent('drop',{dataTransfer:handle});
  await page.waitForTimeout(8000);
  const alive=await Promise.race([page.evaluate(()=>1+1).then(()=> 'RESPONSIVE'),new Promise(r=>setTimeout(()=>r('FROZEN'),5000))]);
  console.log('APP STATE:',alive);
  console.log('ERRORS:',errors.slice(0,8).join(' | '));
  console.log('SLIDES checked:',await page.getByRole('radio',{name:'Slides',exact:true}).isChecked().catch(()=>'n/a'));
});
