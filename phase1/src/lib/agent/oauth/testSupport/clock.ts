/** Deterministic clock for token-expiry and refresh-race tests. Injected into the mock server and subjects. */
export class FakeClock {
 private t:number;private timers:{at:number;fn:()=>void;id:number}[]=[];private seq=0;
 constructor(start=Date.UTC(2026,9,7,12,0,0)){this.t=start;}
 now=()=>this.t;
 seconds=()=>Math.floor(this.t/1000);
 setTimeout=(fn:()=>void,ms:number):number=>{const id=++this.seq;this.timers.push({at:this.t+ms,fn,id});return id;};
 clearTimeout=(id:number)=>{this.timers=this.timers.filter(x=>x.id!==id);};
 /** Advance time and fire due timers in order. */
 advance(ms:number){
  const end=this.t+ms;
  for(;;){
   const due=this.timers.filter(x=>x.at<=end).sort((a,b)=>a.at-b.at||a.id-b.id)[0];
   if(!due)break;
   this.timers=this.timers.filter(x=>x!==due);this.t=Math.max(this.t,due.at);due.fn();
  }
  this.t=end;
 }
 pending(){return this.timers.length;}
}
