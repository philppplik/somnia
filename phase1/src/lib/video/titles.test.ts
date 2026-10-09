import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {clipDuration,fullClip,locate,rippleDelete,sanitizeClips,splitAt,timelineDuration} from './timeline';
import {DEFAULT_TITLE,MAX_TITLE_SECONDS,clampTitleSeconds,clipDisplayName,drawTitle,insertClip,insertIndexAfter,isTitleClip,needsSourceFile,newTitleClip,normalizeTitleClips,sanitizeTitleClip,splitTitleClip,drawTitleCard,patchTitle,sanitizeTitleSpec,setTitleDuration,titleAlphaAt,wrapLines,layoutTitle,type TitleContext} from './titles';
import {SILENCE_RATE,framePlan,renderTitleSpan,silencePlan} from './titleExport';
import {TITLE_CATALOGUES} from './titlesI18n';

test('a new title clip has the contract shape: kind title, empty source, in 0, out = duration, gain 1, not muted',()=>{
 const c=newTitleClip({text:'Hello'},2.5);
 assert.ok(isTitleClip(c)&&!needsSourceFile(c));
 assert.equal(c.kind,'title');assert.equal(c.source,'');assert.equal(c.gain,1);assert.equal(c.muted,false);
 assert.equal(clipDuration(c),2.5);assert.equal(c.title.text,'Hello');assert.equal(c.in_s,0);assert.equal(c.out_s,2.5);
 assert.deepEqual(Object.keys(c.title).slice(0,4),['text','size','color','background']);
 assert.notEqual(newTitleClip().id,newTitleClip().id);
 assert.equal(clampTitleSeconds(0),0.05);assert.equal(clampTitleSeconds(9999),3600);assert.equal(MAX_TITLE_SECONDS,3600);assert.equal(clampTitleSeconds(NaN),3);
 assert.ok(!isTitleClip(fullClip('a.mp4',3)));
});
test('spec sanitising rejects bad colours, fonts and out-of-range numbers',()=>{
 const s=sanitizeTitleSpec({background:'red',color:'#ABC',font:'comic' as never,size:5000,fadeIn:-3,align:'middle' as never,text:'a\r\nb'});
 assert.equal(s.background,DEFAULT_TITLE.background);assert.equal(s.color,'#abc');assert.equal(s.font,'sans');assert.equal(s.size,600);assert.equal(sanitizeTitleSpec({size:1}).size,8);
 assert.equal(s.fadeIn,0);assert.equal(s.align,'center');assert.equal(s.text,'a\nb');
 assert.equal(sanitizeTitleSpec(null).text,DEFAULT_TITLE.text);
 assert.equal(sanitizeTitleSpec({text:'x'.repeat(2000)}).text.length,500);
});
test('patching and resizing only touch the addressed title clip',()=>{
 const v=fullClip('a.mp4',4),t=newTitleClip({text:'One',size:72},2),clips=[v,t];
 const p=patchTitle(clips,t.id,{text:'Two',size:120});
 assert.equal((p[1] as typeof t).title.text,'Two');assert.equal(p[0],v);
 assert.equal(patchTitle(clips,t.id,{text:'One'}),clips,'no-op returns the same array');assert.equal((p[1] as typeof t).title.size,120);
 assert.equal(patchTitle(clips,v.id,{text:'x'}),clips,'video clips are not titles');
 assert.equal(clipDuration(setTitleDuration(clips,t.id,5)[1]),5);
 assert.equal(clipDuration(setTitleDuration(clips,v.id,1)[0]),4);
});
test('titles live on the timeline: sanitize keeps them, ripple/locate work, durations add up',()=>{
 const v=fullClip('a.mp4',4),t=newTitleClip({text:'Intro'},2);
 const clips=insertClip([v],t,0);
 assert.equal(timelineDuration(clips),6);
 assert.equal(sanitizeClips(clips,{'a.mp4':4}).length,2,'unknown synthetic source is kept');
 assert.equal(locate(clips,1)?.range.clip.id,t.id);assert.equal(locate(clips,3)?.range.clip.id,v.id);
 const halves=splitTitleClip(t,0.5)!;
 assert.ok(halves.every(h=>isTitleClip(h)&&h.in_s===0&&h.id!==t.id)&&halves[0].id!==halves[1].id);assert.equal(halves[0].out_s,0.5);assert.equal(halves[1].out_s,1.5);
 assert.equal(timelineDuration([...halves,v]),6);assert.equal(splitTitleClip(t,0.01),null);assert.equal(splitTitleClip(t,1.99),null);
 assert.equal(splitAt(clips,2.5)!.length,3,'splitting the video clip next to a title still works');
 assert.equal(rippleDelete(clips,t.id).length,1);
 assert.equal(insertIndexAfter(clips,1),1);assert.equal(insertIndexAfter(clips,3),2);assert.equal(insertIndexAfter(clips,99),2);
 assert.equal(isTitleClip(insertClip(clips,newTitleClip(),-5)[0]),true);
 assert.equal(clipDisplayName(t,'x'),'Intro');assert.equal(clipDisplayName(v,'a'),'a');
 assert.equal(clipDisplayName(newTitleClip({text:'\n  \nSecond line'}),'x'),'Second line');
});
test('sanitizing repairs a title clip that lost its range or contract fields',()=>{
 const t=newTitleClip({},2),broken={...t,in_s:1,out_s:1.5,source:'x',gain:0.5,muted:true};
 const [fixed]=normalizeTitleClips([broken]);assert.equal(fixed.in_s,0);assert.equal(fixed.out_s,0.5);assert.equal(fixed.source,'');assert.equal(fixed.gain,1);assert.equal(fixed.muted,false);
 assert.equal(sanitizeTitleClip({...t,in_s:0,out_s:99999}).out_s,3600);assert.equal(sanitizeTitleClip({...t,out_s:0}).out_s,0.05);
 const v=fullClip('a.mp4',1);assert.equal(normalizeTitleClips([v])[0],v);
});
test('fades are linear, symmetric and never longer than half the card',()=>{
 const f={fadeIn:1,fadeOut:1};
 assert.equal(titleAlphaAt(f,4,0),0);assert.equal(titleAlphaAt(f,4,0.5),0.5);assert.equal(titleAlphaAt(f,4,2),1);assert.equal(titleAlphaAt(f,4,3.5),0.5);assert.equal(titleAlphaAt(f,4,4),0);
 assert.equal(titleAlphaAt({fadeIn:0,fadeOut:0},2,0),1);
 assert.ok(titleAlphaAt({fadeIn:5,fadeOut:5},2,1)<=1);assert.equal(titleAlphaAt(f,0,0),0);
});
test('word wrap keeps newlines, wraps greedily and breaks over-long words',()=>{
 const m=(s:string)=>s.length;
 assert.deepEqual(wrapLines('aa bb cc dd',5,m),['aa bb','cc dd']);
 assert.deepEqual(wrapLines('a\n\nb',9,m),['a','','b']);
 assert.deepEqual(wrapLines('abcdefgh',3,m),['abc','def','gh']);
});
const fakeCtx=()=>{
 const log:string[]=[];
 const ctx:TitleContext&{log:string[]}={log,fillStyle:'',font:'',textAlign:'',textBaseline:'',globalAlpha:1,
  fillRect(x,y,w,h){log.push(`rect ${ctx.fillStyle} a=${ctx.globalAlpha.toFixed(2)} ${x},${y},${w},${h}`);},
  fillText(t,x,y){log.push(`text ${t} @${Math.round(x)},${Math.round(y)} ${ctx.textAlign} ${ctx.fillStyle}`);},
  measureText(t){const px=Number(/(\d+(?:\.\d+)?)px/.exec(ctx.font)?.[1]??10);return{width:t.length*px*0.5};}};
 return ctx;
};
test('drawTitle paints the background, then centred text in the chosen colour, honouring fade alpha',()=>{
 const ctx=fakeCtx();const spec=sanitizeTitleSpec({text:'Hello world',size:72,background:'#112233',color:'#ffeedd',fadeIn:1,fadeOut:0});
 drawTitle(ctx,spec,1280,720,0.5,4);
 const viaCard=fakeCtx();drawTitleCard(viaCard,{...newTitleClip(spec,4)},1280,720,0.5);assert.deepEqual(viaCard.log,ctx.log,'drawTitleCard is drawTitle on the clip');
 assert.match(ctx.font,/^700 48px /,'72px on 1080p is 48px on 720p');
 assert.ok(ctx.log.some(l=>l.startsWith('rect #112233 a=0.50')));
 const text=ctx.log.find(l=>l.startsWith('text Hello world'))!;
 assert.ok(text.includes('@640,360')&&text.includes('center')&&text.endsWith('#ffeedd'),text);
 assert.equal(ctx.globalAlpha,1);
 
});
test('layout wraps long text, shrinks to fit the frame and positions by alignment',()=>{
 const measure=(font:string)=>{const px=Number(/(\d+(?:\.\d+)?)px/.exec(font)![1]);return(s:string)=>s.length*px*0.5;};
 const long=sanitizeTitleSpec({text:'word '.repeat(80),size:200});
 const l=layoutTitle(long,1280,720,measure);
 assert.ok(l.lines.length>1);assert.ok(l.fontPx<720*200/1080,'shrunk below the requested size');assert.ok(l.fontPx>=720*200/1080*0.4-0.01);
 const left=layoutTitle(sanitizeTitleSpec({text:'Hi',align:'left',vAlign:'top'}),1280,720,measure);
 assert.equal(left.x,Math.round(720*0.08));assert.equal(left.top,Math.round(720*0.08));
 const right=layoutTitle(sanitizeTitleSpec({text:'Hi',align:'right',vAlign:'bottom'}),1280,720,measure);
 assert.equal(right.x,1280-Math.round(720*0.08));assert.ok(right.top>360);
});
test('frame plan covers the span exactly; silence plan covers it sample-exactly',()=>{
 const fp=framePlan(10,1.01,30);const last=fp[fp.length-1];
 assert.equal(fp[0].timestamp,10);assert.equal(fp.length,31);assert.ok(Math.abs(last.timestamp+last.duration-11.01)<1e-9);
 assert.ok(fp.every((f,i)=>i===0||f.timestamp>fp[i-1].timestamp));
 assert.equal(framePlan(0,0.01,30).length,1);
 for(const d of [0.05,0.5,1.3,3,7.77]){
  const plan=silencePlan(2,d);const frames=plan.reduce((n,c)=>n+c.frames,0);
  assert.equal(frames,Math.round(d*SILENCE_RATE),`d=${d}`);
  assert.equal(plan[0].timestamp,2);
  plan.forEach((c,i)=>{if(i)assert.ok(Math.abs(c.timestamp-(plan[i-1].timestamp+plan[i-1].frames/SILENCE_RATE))<1e-9);});
 }
});
test('renderTitleSpan emits frames and matching silence on the timeline clock, and stops on cancel',async()=>{
 const clip=newTitleClip({text:'Hi',fadeIn:0,fadeOut:0},1.5);const ctx=fakeCtx();
 const frames:[number,number][]=[];const silence:{timestamp:number;n:number}[]=[];
 const r=await renderTitleSpan({clip,start:4,width:640,height:360,fps:25,ctx,addFrame:async(t,d)=>{frames.push([t,d]);},addSilence:async c=>{assert.equal(c.channels,2);assert.ok(c.data.every(v=>v===0));silence.push({timestamp:c.timestamp,n:c.data.length/2});}});
 assert.equal(r.frames,38);assert.equal(frames[0][0],4);
 const end=frames[frames.length-1];assert.ok(Math.abs(end[0]+end[1]-5.5)<1e-9);
 assert.equal(silence.reduce((a,c)=>a+c.n,0),Math.round(1.5*SILENCE_RATE));
 assert.equal(ctx.log.filter(l=>l.startsWith('text')).length,1,'static card is drawn once, not per frame');
 const mono:{channels:number;n:number}[]=[];await renderTitleSpan({clip,start:0,width:64,height:36,fps:25,ctx:fakeCtx(),addFrame:async()=>{},silenceFormat:{channels:1,rate:44100},addSilence:async c=>{assert.equal(c.rate,44100);mono.push({channels:c.channels,n:c.data.length});}});
 assert.ok(mono.every(m=>m.channels===1)&&mono.reduce((a,m)=>a+m.n,0)===Math.round(1.5*44100),'silence follows the source layout');
 const none=await renderTitleSpan({clip,start:0,width:64,height:36,fps:25,ctx:fakeCtx(),addFrame:async()=>{}});assert.equal(none.silenceChunks,0);
 let n=0;await assert.rejects(renderTitleSpan({clip,start:0,width:64,height:36,fps:25,ctx:fakeCtx(),addFrame:async()=>{},checkCancel:()=>{if(++n>3)throw new Error('Export cancelled');}}),/cancelled/);
 const fade=newTitleClip({fadeIn:1,fadeOut:1},2);const c2=fakeCtx();
 await renderTitleSpan({clip:fade,start:0,width:64,height:36,fps:10,ctx:c2,addFrame:async()=>{}});
 assert.ok(c2.log.filter(l=>l.startsWith('text')).length>10,'fading card redraws each frame');
});
test('all five languages carry the same title-card keys, none empty, same placeholders',()=>{
 const en=TITLE_CATALOGUES.en,keys=Object.keys(en).sort();
 assert.ok(keys.length>20&&keys.every(k=>k.startsWith('video.card.')));
 const ph=(s:string)=>(s.match(/\{\w+\}/g)??[]).sort().join();
 for(const [tag,cat] of Object.entries(TITLE_CATALOGUES)){
  assert.deepEqual(Object.keys(cat).sort(),keys,tag);
  for(const k of keys){assert.ok(cat[k].trim(),`${tag} ${k}`);assert.equal(ph(cat[k]),ph(en[k]),`${tag} ${k}`);}
 }
 assert.deepEqual(Object.keys(TITLE_CATALOGUES).sort(),['de','en','es','fr','pt-BR']);
});
test('every video.card.* key used in code exists in the catalogue',()=>{
 const used=new Set<string>();
 for(const dir of ['../../components/video/','./'])for(const f of readdirSync(new URL(dir,import.meta.url)).filter(f=>/\.tsx?$/.test(f)&&!f.includes('.test.')))
  for(const m of readFileSync(new URL(dir+f,import.meta.url),'utf8').matchAll(/['"`](video\.card\.\w+)['"`]/g))used.add(m[1]);
 assert.ok(used.size>15);
 for(const k of used)assert.ok(k in TITLE_CATALOGUES.en,k);
});
