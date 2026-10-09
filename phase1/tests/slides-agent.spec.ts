import {test,expect} from '@playwright/test';import path from 'node:path';
test('module-only deck tool stages without apply; reviewed apply/undo protects manual history and reopen identity',async({page})=>{
 await page.goto('/');await page.getByRole('radio',{name:'Slides',exact:true}).click();await page.getByLabel('Open PPTX',{exact:true}).setInputFiles(path.resolve('slides-engine/fixtures/independent.pptx'));await expect(page.getByAltText('Slide 1',{exact:true})).toBeVisible({timeout:30000});await expect(page.getByRole('region',{name:'Slide preview'})).toHaveAttribute('aria-busy','false');
 const result=await page.evaluate(async()=>{
  // Test-only module imports, no production panel bridge or window API.
  const w=await import('/src/lib/agent/deckWorkspace.ts' as string),tools=await import('/src/lib/agent/deckStudio.ts' as string),session=await import('/src/lib/slides/session.ts' as string);
  const name='independent.pptx',before=w.assertDeck(name);let staged='';const snapshot=()=>{const e=w.assertDeck(name);return {ref:{documentId:e.identity,path:name,studioKind:'slides',adapter:'deck-text-v1',revision:e.revision},text:e.text};};
  const registry=tools.createDeckStudioRegistry({snapshot,propose:(after:string)=>{staged=after;}}),ctx={files:()=>w.deckFiles(),propose:async()=>{throw Error('No write');}},signal=new AbortController().signal;
  const info=JSON.parse(await registry.run('deck_inspect',{},ctx,signal));await registry.run('deck_propose_changes',{changes:[{slide:0,run:0,text:'Reviewed AI title'}]},ctx,signal);
  if(w.assertDeck(name).text!==before.text)throw Error('Proposal auto-applied');await w.applyDeck(name,staged,'ai:test',before);if(JSON.parse(w.assertDeck(name).text).slides[0].texts[0].text!=='Reviewed AI title')throw Error('Apply failed');
  let wrong='';try{await w.undoDeck(name,'ai:wrong');}catch(e){wrong=String(e);}await w.undoDeck(name,'ai:test');if(w.assertDeck(name).text!==before.text)throw Error('Undo failed');
  await w.applyDeck(name,staged,'ai:test2');const now=w.assertDeck(name);await registry.run('deck_propose_changes',{changes:[{slide:0,run:0,text:'Newest AI title'}]},ctx,signal);await w.applyDeck(name,staged,'ai:newest');let newest='';try{await w.undoDeck(name,'ai:test2');}catch(e){newest=String(e);}if(!newest.includes('later'))throw Error('Older AI undo passed');await w.undoDeck(name,'ai:newest');const run={slide:0,run:0,part:'ppt/slides/slide1.xml',text:'Reviewed AI title'};
  await session.editSlideText(run,'Manual edit');await session.editSlideText({...run,text:'Manual edit'},'Reviewed AI title');
  let guard='';try{await w.undoDeck(name,'ai:test2');}catch(e){guard=String(e);}if(!guard.includes('Not restoring'))throw Error('Manual edit+revert bypassed undo guard');
  let stale='';try{await w.applyDeck(name,before.text,'ai:stale',now);}catch(e){stale=String(e);}if(!stale.includes('changed'))throw Error('Stale apply passed');
  return {info,wrong,guard,stale,beforeIdentity:before.identity};
 });
 expect(result.info.binaryDisclosed).toBe(false);expect(result.wrong).toContain('later');expect(result.guard).toContain('Not restoring');
 await expect(page.getByRole('textbox',{name:'Text run 1',exact:true})).toHaveValue('Reviewed AI title');await page.screenshot({path:'validation/slides/package5-ai-apply.png',fullPage:true});
 page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Close presentation',exact:true}).click();await page.getByLabel('Open PPTX',{exact:true}).setInputFiles(path.resolve('slides-engine/fixtures/independent.pptx'));await expect(page.getByAltText('Slide 1',{exact:true})).toBeVisible({timeout:30000});await expect(page.getByRole('region',{name:'Slide preview'})).toHaveAttribute('aria-busy','false');
 const reopened=await page.evaluate(async()=>{const w=await import('/src/lib/agent/deckWorkspace.ts' as string);try{await w.undoDeck('independent.pptx','ai:test2');return 'unsafe';}catch(e){return String(e);}});expect(reopened).toContain('Not restoring');
});
