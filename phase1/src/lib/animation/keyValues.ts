import type {Edit} from './edit';
import type {Composition,KeyRef} from './model';
/** Moves the values of the selected keys: `snap` rounds them to a step (amount > 0), `offset` adds an amount, `scale` multiplies the distance to each property's earliest selected key by amount percent. */
export type ValueMode='offset'|'scale'|'snap';
export const VALUE_MODES:readonly ValueMode[]=['offset','scale','snap'];
export const MAX_VALUE_KEYS=800,MAX_OFFSET=100000,MIN_SCALE_PERCENT=-1000,MAX_SCALE_PERCENT=1000;
const bad=(m:string):never=>{throw Object.assign(new Error(m),{expected:true});};
export function valueEdits(c:Composition,refs:readonly KeyRef[],mode:ValueMode,amount:number):Edit[]{
 if(!VALUE_MODES.includes(mode))return bad('Unknown value mode.');
 if(!Number.isFinite(amount))return bad('Enter a number.');
 if(mode==='offset'&&Math.abs(amount)>MAX_OFFSET)return bad(`Use an offset between -${MAX_OFFSET} and ${MAX_OFFSET}.`);
 if(mode==='snap'&&!(amount>0&&amount<=MAX_OFFSET))return bad(`Use a step above 0 and up to ${MAX_OFFSET}.`);
 if(mode==='scale'&&(amount<MIN_SCALE_PERCENT||amount>MAX_SCALE_PERCENT))return bad(`Use a scale from ${MIN_SCALE_PERCENT} to ${MAX_SCALE_PERCENT} percent.`);
 const live=refs.filter(r=>c.layers.find(l=>l.id===r.layer)?.transform[r.prop].keys.some(k=>k.t===r.t));
 if(!live.length)return bad('Select keys first.');if(live.length>MAX_VALUE_KEYS)return bad('Too many keys.');
 const groups=new Map<string,KeyRef[]>();for(const r of live)groups.set(`${r.layer}\0${r.prop}`,[...(groups.get(`${r.layer}\0${r.prop}`)??[]),r]);
 const edits:Edit[]=[];
 for(const rs of groups.values()){
  const layer=c.layers.find(l=>l.id===rs[0].layer)!,prop=rs[0].prop;
  const ks=rs.map(r=>layer.transform[prop].keys.find(k=>k.t===r.t)!).sort((a,b)=>a.t-b.t),f=amount/100;
  for(const k of ks){
   const v=k.v;let next:number|[number,number];const snap=(x:number)=>Math.round(Math.round(x/amount)*amount*1e6)/1e6;
   if(typeof v==='number'){const a=ks[0].v as number;next=mode==='snap'?snap(v):mode==='offset'?v+amount:a+(v-a)*f;}
   else{const a=ks[0].v as [number,number],w=v as [number,number];next=mode==='snap'?[snap(w[0]),snap(w[1])]:mode==='offset'?[w[0]+amount,w[1]+amount]:[a[0]+(w[0]-a[0])*f,a[1]+(w[1]-a[1])*f];}
   const same=typeof next==='number'?next===v:(next[0]===(v as [number,number])[0]&&next[1]===(v as [number,number])[1]);
   if(!same)edits.push({type:'prop.set',layer:layer.id,prop,t:k.t,value:next});
  }
 }
 if(!edits.length)return bad('The values would not change.');
 return edits;
}
