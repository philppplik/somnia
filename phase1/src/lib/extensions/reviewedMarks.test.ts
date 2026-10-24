import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewedMarkFor,recordReviewedMark,clearReviewedMarks,REVIEWED_MARKS_KEY} from './reviewedMarks';
const storage=()=>{const m=new Map<string,string>();return{getItem:(k:string)=>m.get(k)??null,setItem:(k:string,v:string)=>m.set(k,v),removeItem:(k:string)=>{m.delete(k);},map:m};};
test('marks are version-bound, bounded and cleared per extension',()=>{
 const ls=storage();
 assert.equal(reviewedMarkFor('a.b','1.0.0',ls),null);
 recordReviewedMark('a.b','1.0.0','Somnia maintainers',ls);
 recordReviewedMark('a.b','1.1.0','Jane',ls);
 recordReviewedMark('c.d','1.0.0','Jane',ls);
 assert.deepEqual(reviewedMarkFor('a.b','1.0.0',ls),{reviewer:'Somnia maintainers'});
 assert.equal(reviewedMarkFor('a.b','1.2.0',ls),null,'other versions stay unmarked');
 clearReviewedMarks('a.b',ls);
 assert.equal(reviewedMarkFor('a.b','1.0.0',ls),null);
 assert.deepEqual(reviewedMarkFor('c.d','1.0.0',ls),{reviewer:'Jane'});
});
test('corrupt and oversized stored data reads as empty and never throws',()=>{
 const ls=storage();
 ls.map.set(REVIEWED_MARKS_KEY,'not json');assert.equal(reviewedMarkFor('a.b','1.0.0',ls),null);
 ls.map.set(REVIEWED_MARKS_KEY,JSON.stringify({'a.b@1.0.0':{reviewer:''},'c.d@1.0.0':{reviewer:'ok'}}));
 assert.equal(reviewedMarkFor('a.b','1.0.0',ls),null,'empty reviewer rejected');
 assert.deepEqual(reviewedMarkFor('c.d','1.0.0',ls),{reviewer:'ok'});
 recordReviewedMark('x.y','2.0.0','r',ls);
 assert.ok(JSON.parse(ls.map.get(REVIEWED_MARKS_KEY)!)['x.y@2.0.0'],'recovers after corrupt read');
});
