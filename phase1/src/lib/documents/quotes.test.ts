import {test} from 'node:test';
import assert from 'node:assert/strict';
import {smartenQuotes,straightenQuotes,convertQuotes} from './quotes';
test('smart quotes open after space, bracket, dash and start; close otherwise',()=>{
 assert.equal(smartenQuotes('He said "hi" to me'),'He said \u201Chi\u201D to me');
 assert.equal(smartenQuotes('"Quoted"'),'\u201CQuoted\u201D');
 assert.equal(smartenQuotes('("a")'),'(\u201Ca\u201D)');
 assert.equal(smartenQuotes("don't 'x'"),'don\u2019t \u2018x\u2019');
 assert.equal(smartenQuotes('a\u2014"b"'),'a\u2014\u201Cb\u201D');
});
test('the character before the selection decides the first quote',()=>{
 assert.equal(smartenQuotes('"x"','a'),'\u201Dx\u201D');
 assert.equal(smartenQuotes('"x"',' '),'\u201Cx\u201D');
});
test('straighten undoes smarten and leaves other text alone',()=>{
 const s='\u201CIt\u2019s \u2018fine\u2019\u201D \u00E4\u00F6 \u2014';
 assert.equal(straightenQuotes(s),'"It\'s \'fine\'" \u00E4\u00F6 \u2014');
 const plain='say "yes" and \'no\' now';
 assert.equal(straightenQuotes(smartenQuotes(plain)),plain);
 assert.equal(smartenQuotes(smartenQuotes(plain)),smartenQuotes(plain));
});
test('German and French styles, also from curly or other-style text',()=>{
 assert.equal(convertQuotes('He said "hi" and \'x\'','de'),'He said \u201Ehi\u201C and \u201Ax\u2018');
 assert.equal(convertQuotes('"Ja", sagte er','de'),'\u201EJa\u201C, sagte er');
 assert.equal(convertQuotes('\u201Chi\u201D','de'),'\u201Ehi\u201C');
 assert.equal(convertQuotes('"oui" l\'ami','fr'),'\u00ABoui\u00BB l\u2019ami');
 assert.equal(convertQuotes('\u00ABa\u00BB','straight'),'"a"');
 assert.equal(convertQuotes('\u201Ea\u201C','smart'),'\u201Ca\u201D');
 assert.equal(convertQuotes('"a"','de','a'),'\u201Ca\u201C');
});
test('empty text and bad mode',()=>{
 assert.equal(smartenQuotes(''),'');assert.equal(straightenQuotes(''),'');
 assert.throws(()=>convertQuotes('x','curly' as never));
 assert.equal(convertQuotes('"a"','straight'),'"a"');
});
