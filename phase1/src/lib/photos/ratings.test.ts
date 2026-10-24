import test from 'node:test';
import assert from 'node:assert/strict';
import {getRating,isRating,MAX_RATING,photoRatings,setRating,subscribeRatings} from './ratings';
test('isRating accepts integers 0..5 only',()=>{
 assert.ok(isRating(0)&&isRating(3)&&isRating(MAX_RATING));
 assert.ok(!isRating(-1)&&!isRating(6)&&!isRating(2.5)&&!isRating('3')&&!isRating(null));
});
test('setRating stores, overwrites and clears (0) per media name',()=>{
 setRating('a.png',4);
 setRating('b.png',2);
 assert.equal(getRating('a.png'),4);
 assert.equal(getRating('b.png'),2);
 assert.equal(getRating('c.png'),0); // unrated reads as 0
 setRating('a.png',5);
 assert.equal(getRating('a.png'),5);
 setRating('a.png',0);
 assert.equal(getRating('a.png'),0);
 assert.ok(!('a.png' in photoRatings())); // cleared entries leave the map
 setRating('b.png',0);
});
test('invalid ratings and empty names are ignored',()=>{
 setRating('x.png',7);
 setRating('x.png',-1);
 setRating('',3);
 assert.equal(getRating('x.png'),0);
 assert.deepEqual(photoRatings(),{});
});
test('subscribers fire on change and unsubscribe stops them',()=>{
 let hits=0;
 const off=subscribeRatings(()=>hits++);
 setRating('n.png',1);
 setRating('n.png',0);
 assert.equal(hits,2);
 off();
 setRating('n.png',3);
 assert.equal(hits,2);
 setRating('n.png',0);
});
