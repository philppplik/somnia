import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {buildDict,type SpellLang,addUserWord,checkCells,expandDic,isKnown,loadDictionary,parseAff,parseSpellChange,readUserWords,replaceWholeWord,replacementProblem,resetDictionaryForTests,suggest,wordsToCheck} from './spelling';
const dic=readFileSync('public/dict/en-US.dic','utf8'),aff=readFileSync('public/dict/en-US.aff','utf8');
const dict=expandDic(dic,aff),none=new Set<string>();
test('the shipped dictionary expands to a real word list',()=>{
 assert.ok(dict.size>100_000,String(dict.size));
 for(const w of ['the','running','happier','unhappy','cats','color','spreadsheet',"don't",'reopen'])assert.ok(dict.has(w),w);
 for(const w of ['teh','recieve','qwertyx','1th'])assert.ok(!dict.has(w),w);
});
test('affix files: groups, cross flags and bad lines',()=>{
 const a=parseAff('SFX S Y 1\nSFX S 0 s [^s]\nPFX U Y 1\nPFX U 0 un .\nSFX Z Y 1\nSFX Z 0 ( [\nFOO bar');
 assert.equal(a.groups.get('S')?.rules.length,1);assert.equal(a.groups.get('Z')?.rules.length,0,'a broken condition is dropped');
 const s=expandDic('2\nhappy/US\ncar/S',"SFX S Y 1\nSFX S 0 s .\nPFX U Y 1\nPFX U 0 un .");
 assert.deepEqual([...s].sort(),['car','cars','happy','happys','unhappy','unhappys']);
});
test('words to check skip what is not prose',()=>{
 assert.deepEqual(wordsToCheck('Helo wrld, NASA iPhone x 4th A1 foo_bar'),['Helo','wrld']);
 assert.deepEqual(wordsToCheck('mail me at bob@example.com'),[]);assert.deepEqual(wordsToCheck('see https://exmple.com now'),[]);
 assert.deepEqual(wordsToCheck('café naïve'),[]);assert.deepEqual(wordsToCheck("it’s 'quoted' don't"),["it’s",'quoted',"don't"]);
});
test('known words, user words and possessives',()=>{
 assert.ok(isKnown('Cats',dict,none));assert.ok(isKnown("dog's",dict,none));assert.ok(!isKnown('teh',dict,none));
 assert.ok(isKnown('Zorblax',dict,new Set(['zorblax'])));
});
test('suggestions fix typos in the right capitalisation',()=>{
 assert.equal(suggest('teh',dict)[0],'the');assert.ok(suggest('Recieve',dict).includes('Receive'));
 assert.ok(suggest('spreadsheat',dict).includes('spreadsheet'));assert.ok(suggest('qqqqqqqqqqqqqqq',dict).length===0);
 assert.ok(suggest('teh',dict).length<=6);
});
test('checking cells only reads text constants',()=>{
 const t=(address:string,v:string,formula:string|null=null)=>({address,value:{t:'Text' as const,v},formula});
 const r=checkCells([t('A1','Helo wrld'),t('A2','fine words'),t('A3','teh','="teh"'),{address:'A4',value:{t:'Number' as const,v:3},formula:null},t('A5','Helo Helo'),t('A6','xyzzy'),{address:'A7',value:{t:'Empty' as const},formula:null}],dict,none,new Set(['xyzzy']));
 assert.deepEqual(r.issues,[{cell:'A1',word:'Helo'},{cell:'A1',word:'wrld'},{cell:'A5',word:'Helo'}]);assert.equal(r.total,3);assert.equal(r.scanned,4);
 const big=Array.from({length:400},(_,i)=>t('A'+(i+1),'zzzq'));assert.equal(checkCells(big,dict,none,new Set()).issues.length,300);assert.equal(checkCells(big,dict,none,new Set()).total,400);
});
test('replacing a word keeps the rest of the text',()=>{
 assert.equal(replaceWholeWord('teh cat and tehran, teh end','teh','the'),'the cat and tehran, the end');
 assert.equal(replaceWholeWord('Teh','teh','the'),null);assert.equal(replaceWholeWord("'teh'",'teh','the'),"'the'");assert.equal(replaceWholeWord('nothing','teh','the'),null);
});
test('replacement and command input are bounded',()=>{
 assert.equal(replacementProblem(''),'empty');assert.equal(replacementProblem('x'.repeat(65)),'long');assert.equal(replacementProblem('a\nb'),'chars');assert.equal(replacementProblem('=SUM(A1)'),'formula');assert.equal(replacementProblem('the'),null);
 assert.deepEqual(parseSpellChange({cell:'b2',word:'teh',to:' the '}),{cell:'B2',word:'teh',to:'the'});
 for(const bad of [null,[],{},{cell:'B2',word:'teh'},{cell:'B2:C3',word:'teh',to:'the'},{cell:'B2',word:'',to:'the'},{cell:'B2',word:'teh',to:'=1+1'},{cell:'B2',word:'teh',to:'the',x:1},{cell:'B2',word:'x'.repeat(41),to:'the'}])assert.throws(()=>parseSpellChange(bad),JSON.stringify(bad));
});
test('user words persist in bounded storage and survive bad data',()=>{
 const m=new Map<string,string>(),st={getItem:(k:string)=>m.get(k)??null,setItem:(k:string,v:string)=>{m.set(k,v);}};
 assert.equal(readUserWords(st).size,0);addUserWord('Zorblax',st);addUserWord('zorblax',st);assert.deepEqual([...readUserWords(st)],['zorblax']);
 m.set('sheets.spelling.userWords','not json');assert.equal(readUserWords(st).size,0);m.set('sheets.spelling.userWords','[1,"ok",""]');assert.deepEqual([...readUserWords(st)],['ok']);
 assert.equal(readUserWords(undefined).size,0);assert.equal(addUserWord('x'.repeat(41),st).size,1);
});
test('the dictionary loads once, retries after a failure and refuses an empty list',async()=>{
 resetDictionaryForTests();let calls=0;
 await assert.rejects(loadDictionary(async()=>{calls++;throw Error('offline');}));
 await assert.rejects(loadDictionary(async p=>{calls++;return p.endsWith('.aff')?'':'0\n';}),/empty/);
 const ok=async(p:string)=>{calls++;return p.endsWith('.dic')?dic:aff;};
 const a=await loadDictionary(ok),b=await loadDictionary(ok);assert.equal(a,b);assert.ok(a.has('the'));resetDictionaryForTests();
});
test('the shipped es, fr and pt-BR lists load lazily and check real words',async()=>{
 resetDictionaryForTests();const paths:string[]=[];
 const fetchText=async(p:string)=>{paths.push(p);return readFileSync('public'+p,'utf8');};
 const none=new Set<string>();
 const cases:[SpellLang,string[],string[]][]=[
  ['es',['casa','casas','hablando','cantaron','niños','ortografía'],['kasa','ortografia']],
  ['fr',['maison','mangeons',"l'homme","qu'il","aujourd'hui",'élève'],['maisonn','elève']],
  ['pt-BR',['casa','cantaram','planilha','você','trabalhando'],['planilah','vocé']],
 ];
 for(const [lang,good,bad] of cases){
  const d=await loadDictionary(fetchText,lang);assert.ok(d.size>20_000,lang);
  for(const w of good)assert.ok(isKnown(w,d,none,lang),lang+' '+w);
  for(const w of bad)assert.ok(!isKnown(w,d,none,lang),lang+' '+w);
  assert.ok(wordsToCheck('Straße café',true).length===2&&wordsToCheck('café')[0]===undefined);
 }
 assert.deepEqual(paths.filter(p=>p.endsWith('.dic')),['/dict/es.dic','/dict/fr.dic','/dict/pt-BR.dic']);
 const fr=await loadDictionary(fetchText,'fr');assert.equal(paths.length,6,'a second load reuses the first');
 assert.equal(suggest('maisson',fr,'fr')[0],'maison');assert.ok(suggest('planilah',await loadDictionary(fetchText,'pt-BR'),'pt-BR').includes('planilha'));
 await assert.rejects(loadDictionary(fetchText,'de' as SpellLang));
 const es=await loadDictionary(fetchText,'es');
 const rep=checkCells([{address:'A1',formula:null,value:{t:'Text',v:'La kasa es bonita'}} as any],es,none,none,'es');assert.deepEqual(rep.issues,[{cell:'A1',word:'kasa'}]);
 resetDictionaryForTests();
});
test('affix files: FLAG long and numeric flags, forbidden words and chained suffixes',()=>{
 const l=buildDict('2\nbon/Aa\nmal/Aa\n',"FLAG long\nSFX Aa Y 1\nSFX Aa 0 s .");assert.ok(l.has('bons')&&!l.has('bonss'));
 const n=buildDict('2\nrun/1\nbad/1,9\n',"FLAG num\nFORBIDDENWORD 9\nSFX 1 Y 1\nSFX 1 0 ner .");assert.ok(n.has('runner')&&!n.has('bad')&&!n.has('badner'));
 const c=buildDict('1\nact/A\n',"SFX A Y 1\nSFX A 0 ion/B .\nSFX B Y 1\nSFX B 0 s .");assert.ok(c.has('action')&&c.has('actions')&&!c.has('actionss'));
 const p=buildDict('1\nfaire/AP\n',"PFX P Y 1\nPFX P 0 re .\nSFX A Y 1\nSFX A re ons re");assert.ok(p.has('refaire')&&p.has('refaions')&&!p.has('refaix'));
});
