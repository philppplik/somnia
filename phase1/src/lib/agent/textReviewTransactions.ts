import type {SelectedTextReview} from './selectedTextPanelPorts';
/** One-use UI review ids. Native ports retain owner receipt identities privately. */
export class TextReviewTransactions{
 private pending=new Map<string,SelectedTextReview>();private owned=new Map<string,SelectedTextReview>();private generation=0;private inFlight=0;
 get busy(){return this.inFlight>0;}get hasPending(){return this.pending.size>0;}has(id:string){return this.pending.has(id)||this.owned.has(id);}
 stage(id:string,r:SelectedTextReview){if(this.has(id))throw Error('Duplicate text review.');this.pending.set(id,r);}
 reject(id:string){const r=this.pending.get(id);if(!r)return false;this.pending.delete(id);r.reject();return true;}
 async accept(id:string,signal:AbortSignal){const r=this.pending.get(id);if(!r)throw Error('Text preview is no longer pending.');const generation=this.generation;this.pending.delete(id);this.inFlight++;try{await r.accept(signal);if(generation!==this.generation)throw Error('Review session changed. Inspect native edit before retrying.');this.owned.set(id,r);}finally{this.inFlight--;}}
 async undo(id:string,signal:AbortSignal){const r=this.owned.get(id);if(!r)throw Error('No owned text receipt.');this.owned.delete(id);this.inFlight++;try{await r.undo(signal);}finally{this.inFlight--;}}
 clear(){this.generation++;for(const id of this.pending.keys())this.reject(id);this.owned.clear();}
 revokePending(){for(const id of this.pending.keys())this.reject(id);}
}
