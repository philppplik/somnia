import {test} from 'node:test';
import assert from 'node:assert/strict';
import {bucketDates,currentPeriod,isDateFmt,MAX_TIMELINE_PERIODS,periodFilterOp,periodTicksFromMirror,periodsFitValues,pickedPeriodValues,serialToYMD} from './timelineOps';
import {localSerial} from './clock';

const serial=(y:number,m:number,d:number)=>25569+Date.UTC(y,m-1,d)/86_400_000;

test('serialToYMD is the exact inverse of clock.ts localSerial and guards its range',()=>{
 for(const [y,m,d] of [[1900,1,1],[1999,12,31],[2026,10,18],[2099,2,28]] as const){
  const s=serial(y,m,d);assert.deepEqual(serialToYMD(s),{y,m,d},`${y}-${m}-${d}`);
 }
 const now=new Date(2026,9,18,13,45,0,0),s=localSerial(now);
 assert.ok(s!==null);assert.deepEqual(serialToYMD(Math.floor(s)),{y:2026,m:10,d:18},'a floored NOW() serial lands on the local date');
 assert.equal(serialToYMD(NaN),null);assert.equal(serialToYMD(-5),null);
});

test('isDateFmt accepts date and time codes and refuses plain numeric formats',()=>{
 for(const ok of ['yyyy-mm-dd','dd.mm.yyyy','mm/dd/yyyy','d mmmm yyyy','dddd, d mmmm yyyy','d mmm yy','mmm yyyy','hh:mm','h:mm AM/PM','yyyy-mm-dd hh:mm','[$-F800]dddd\\,\\ mmmm\\ dd\\,\\ yyyy','DD.MM.YY','m/d/yy h:mm'])
  assert.equal(isDateFmt(ok),true,ok);
 for(const no of ['General','0','0.00','#,##0.00','0%','0.00E+00','@','#,##0 "kg"','[Red]0.00','[>=1]0.0'])
  assert.equal(isDateFmt(no),false,no);
});

test('bucketDates groups chronologically per granularity with serial bounds and values payloads',()=>{
 const serials=[serial(2026,1,15),serial(2026,1,20),serial(2026,3,1),serial(2025,12,31),serial(2026,1,15)];
 for(const g of ['year','quarter','month','day'] as const){
  const r=bucketDates(serials,g,0,'en');
  assert.equal(r.dates,5);assert.equal(r.truncated,false);
  const keys=r.buckets.map(b=>b.key);assert.deepEqual(keys,[...keys].sort((a,b)=>a-b),'chronological');
 }
 const y=bucketDates(serials,'year',2,'en');
 assert.deepEqual(y.buckets.map(b=>b.label),['2025','2026']);
 assert.equal(y.buckets[1].count,4);assert.equal(y.blanks,2);
 assert.deepEqual([y.buckets[1].from,y.buckets[1].to],[serial(2026,1,1),serial(2027,1,1)],'half-open serial bounds for a future range op');
 assert.equal(y.buckets[1].values.length,3,'distinct plain-number texts for kind:values (the doubled day counts once)');
 const q=bucketDates(serials,'quarter',0,'de');
 assert.deepEqual(q.buckets.map(b=>b.label),['2025 Q4','2026 Q1']);
 assert.deepEqual([q.buckets[1].from,q.buckets[1].to],[serial(2026,1,1),serial(2026,4,1)]);
 const m=bucketDates(serials,'month',0,'en');
 assert.deepEqual(m.buckets.map(b=>b.label),['December 2025','January 2026','March 2026']);
 const d=bucketDates(serials,'day',0,'en');
 assert.equal(d.buckets.length,4);assert.equal(d.buckets.find(b=>b.count===2)?.label,d.buckets[1].label,'the doubled day carries count 2');
});

test('bucketDates skips times without dates, caps the list and keeps values distinct',()=>{
 const r=bucketDates([0.5,0.9], 'day',3,'en');
 assert.equal(r.dates,0,'time-only serials are not dates');assert.equal(r.buckets.length,0);assert.equal(r.blanks,3);
 const many=Array.from({length:MAX_TIMELINE_PERIODS+50},(_,i)=>serial(2020,1,1)+i);
 const capped=bucketDates(many,'day',0,'en');
 assert.equal(capped.buckets.length,MAX_TIMELINE_PERIODS);assert.equal(capped.truncated,true);
 const dup=bucketDates([serial(2026,5,5),serial(2026,5,5)],'day',0,'en');
 assert.equal(dup.buckets[0].values.length,1,'same serial counts once in the payload but twice in count');
 assert.equal(dup.buckets[0].count,2);
});

test('period fit gate and combined payload honour the 200-pick bound',()=>{
 const r=bucketDates([serial(2026,1,1),serial(2026,1,2)],'day',0,'en');
 assert.equal(periodsFitValues(r.buckets),true);
 assert.deepEqual(pickedPeriodValues(r.buckets),[String(serial(2026,1,1)),String(serial(2026,1,2))]);
 const wide=bucketDates(Array.from({length:201},(_,i)=>serial(2026,1,1)+i),'day',0,'en');
 assert.equal(periodsFitValues(wide.buckets),false,'201 distinct day values exceed the pick bound');
 assert.equal(periodsFitValues(wide.buckets.slice(0,50)),true,'fewer picked periods fit');
});

test('periodFilterOp routes one picked period to the exact range and the rest to values',()=>{
 const r=bucketDates([serial(2026,1,1),serial(2026,1,2)],'month',0,'en');
 const jan=r.buckets[0];
 assert.deepEqual(periodFilterOp(3,[jan],false),{kind:'range',column:3,from:jan.from,to:jan.to},'one period, no blanks: half-open range, no value list');
 assert.deepEqual(periodFilterOp(3,[jan],true),{kind:'values',column:3,values:pickedPeriodValues([jan]),blanks:true},'blanks picked: values carries the blanks flag');
 const wide=bucketDates(Array.from({length:201},(_,i)=>serial(2026,1,1)+i),'month',0,'en');
 assert.deepEqual(periodFilterOp(3,[wide.buckets[0]],false),{kind:'range',column:3,from:wide.buckets[0].from,to:wide.buckets[0].to},'one dense month still applies as a range');
 const two=bucketDates([serial(2026,1,1),serial(2026,3,1)],'month',0,'en');
 assert.deepEqual(periodFilterOp(3,two.buckets,false),{kind:'values',column:3,values:pickedPeriodValues(two.buckets),blanks:false},'several periods stay a values filter');
 assert.equal(periodFilterOp(3,[],false),null,'nothing picked, no blanks: no op');
 assert.deepEqual(periodFilterOp(3,[],true),{kind:'values',column:3,values:[],blanks:true},'blanks only still apply');
 const days=bucketDates(Array.from({length:201},(_,i)=>serial(2026,1,1)+i),'day',0,'en');
 assert.equal(periodFilterOp(3,days.buckets,false),null,'more than 200 distinct values cannot apply');
});

test('periodTicksFromMirror seeds ticks from a fresh values or range filter only',()=>{
 const r=bucketDates([serial(2026,1,1),serial(2026,3,1)],'month',0,'en');
 const jan=r.buckets[0],mar=r.buckets[1];
 const values=periodTicksFromMirror(r.buckets,{op:{kind:'values',column:0,values:[String(serial(2026,1,1))],blanks:true},range:null,stale:false});
 assert.deepEqual(values?.off,new Set([mar.key]),'only the unlisted period is unticked');
 assert.equal(values?.blanksOn,true,'the blanks flag follows the op');
 const range=periodTicksFromMirror(r.buckets,{op:{kind:'range',column:0,from:mar.from,to:mar.to},range:null,stale:false});
 assert.deepEqual(range?.off,new Set([jan.key]),'the range keeps only the overlapping period');
 assert.equal(range?.blanksOn,false,'a range never keeps blanks');
 assert.equal(periodTicksFromMirror(r.buckets,{op:{kind:'range',column:0,from:mar.from,to:mar.to},range:null,stale:true}),null,'stale offers nothing');
 assert.equal(periodTicksFromMirror(r.buckets,{op:{kind:'custom',column:0,op:'contains',value:'x'},range:null,stale:false}),null,'a custom op cannot map to periods');
 assert.equal(periodTicksFromMirror(r.buckets,{op:null,range:null,stale:false}),null,'a cleared filter starts all-ticked');
});

test('currentPeriod finds the bucket holding a serial, bounds half-open',()=>{
 const r=bucketDates([serial(2026,1,15),serial(2026,3,1)],'month',0,'en');
 const hit=currentPeriod(r.buckets,serial(2026,1,20));
 assert.equal(hit?.label,'January 2026');
 assert.equal(currentPeriod(r.buckets,serial(2026,2,1)),null,'February has no rows');
 assert.equal(currentPeriod(r.buckets,serial(2026,3,1))?.label,'March 2026','from is inclusive');
 assert.equal(currentPeriod(r.buckets,serial(2026,4,1)),null,'to is exclusive');
 assert.equal(currentPeriod([],serial(2026,1,1)),null);
});
