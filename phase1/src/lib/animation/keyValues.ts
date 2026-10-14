import type {Edit} from './edit';
import type {Composition,KeyRef} from './model';
/** `wiggle` adds a seeded random deviation of up to +-amount (amount > 0), the same seed gives the same result. */
/** Moves the values of the selected keys: `snap` rounds them to a step (amount > 0), `offset` adds an amount, `scale` multiplies the distance to each property's earliest selected key by amount percent. */
export type ValueMode='offset'|'scale'|'snap'|'wiggle';
export const VALUE_MODES:readonly ValueMode[]=['offset','scale','snap','wiggle'];
export const MAX_VALUE_KEYS=800,MAX_OFFSET=100000,MIN_SCALE_PERCENT=-1000,MAX_SCALE_PERCENT=1000;
const bad=(m:string):never=>{throw Object.assign(new Error(m),{expected:true});};
/** Small seeded generator (mulberry32) so wiggles are reproducible and testable. */
function rng(seed:number){let a=seed>>>0;return()=>{a=(a+0x6D2B79F5)>>>0;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};}
export function valueEdits(c:Composition,refs:readonly KeyRef[],mode:ValueMode,amount:number,seed=1):Edit[]{
 if(!VALUE_MODES.includes(mode))return bad('Unknown value mode.');
 if(!Number.isFinite(amount))return bad('Enter a number.');
 if(mode==='offset'&&Math.abs(amount)>MAX_OFFSET)return bad(`Use an offset between -${MAX_OFFSET} and ${MAX_OFFSET}.`);
 if((mode==='wiggle'||mode==='snap')&&!(amount>0&&amount<=MAX_OFFSET))return bad(`Use an amount above 0 and up to ${MAX_OFFSET}.`);
 if(mode==='scale'&&(amount<MIN_SCALE_PERCENT||amount>MAX_SCALE_PERCENT))return bad(`Use a scale from ${MIN_SCALE_PERCENT} to ${MAX_SCALE_PERCENT} percent.`);
 const live=refs.filter(r=>c.layers.find(l=>l.id===r.layer)?.transform[r.prop].keys.some(k=>k.t===r.t));
 if(!live.length)return bad('Select keys first.');if(live.length>MAX_VALUE_KEYS)return bad('Too many keys.');
 const groups=new Map<string,KeyRef[]>();for(const r of live)groups.set(`${r.layer}\0${r.prop}`,[...(groups.get(`${r.layer}\0${r.prop}`)??[]),r]);
 const edits:Edit[]=[];const rand=rng(Number.isFinite(seed)?Math.trunc(seed):1);const jit=()=>Math.round((rand()*2-1)*amount*1e4)/1e4;
 for(const rs of groups.values()){
  const layer=c.layers.find(l=>l.id===rs[0].layer)!,prop=rs[0].prop;
  const ks=rs.map(r=>layer.transform[prop].keys.find(k=>k.t===r.t)!).sort((a,b)=>a.t-b.t),f=amount/100;
  for(const k of ks){
   const v=k.v;let next:number|[number,number];
   const snap=(x:number):number=>Math.round(Math.round(x/amount)*amount*1e6)/1e6;
   const one=(x:number,a:number):number=>{
    if(mode==='wiggle')return x+jit();
    if(mode==='snap')return snap(x);
    if(mode==='offset')return x+amount;
    return a+(x-a)*f;};
   if(typeof v==='number')next=one(v,ks[0].v as number);
   else{const a=ks[0].v as [number,number],w=v as [number,number];const nx:number=one(w[0],a[0]),ny:number=one(w[1],a[1]);next=[nx,ny];}
   const same=typeof next==='number'?next===v:(next[0]===(v as [number,number])[0]&&next[1]===(v as [number,number])[1]);
   if(!same)edits.push({type:'prop.set',layer:layer.id,prop,t:k.t,value:next});
  }
 }
 if(!edits.length)return bad('The values would not change.');
 return edits;
}
