import {test} from 'node:test';import assert from 'node:assert/strict';
import {internalTarget,linkTargetProblem,parseAnnotateCommand,parseAnnotations} from './notes';
test('linkTargetProblem allows only web, mail and workbook places',()=>{
 for(const ok of ['https://example.com/a?b=1','http://x.org','mailto:a@b.co','Sheet2!A1',"'My Sheet'!$B$2:C3"])assert.equal(linkTargetProblem(ok),null,ok);
 for(const bad of ['','javascript:alert(1)','file:///etc/passwd','data:text/html,x','https://','https://u@evil.example','https://a b.example','mailto:nobody','mailto:a@b','A1','!A1','Sheet!','x'.repeat(2100)])assert.notEqual(linkTargetProblem(bad),null,bad);
});
test('parseAnnotateCommand',()=>{
 assert.deepEqual(parseAnnotateCommand({kind:'note',text:'  hi '}),{kind:'note',text:'hi'});
 assert.deepEqual(parseAnnotateCommand({kind:'resolve',resolved:false}),{kind:'resolve',resolved:false});
 assert.deepEqual(parseAnnotateCommand({kind:'link',target:'https://a.io',text:'A'}),{kind:'link',target:'https://a.io',text:'A'});
 assert.deepEqual(parseAnnotateCommand({kind:'remove'}),{kind:'remove'});
 for(const bad of [null,[],{},{kind:'x'},{kind:'note'},{kind:'note',text:'  '},{kind:'note',text:'a\u0001'},{kind:'note',text:'x'.repeat(2001)},{kind:'note',text:'a',extra:1},{kind:'resolve'},{kind:'remove',text:'a'},{kind:'link',target:'javascript:1'},{kind:'link',target:5},{kind:'link',target:'https://a.io',text:3}])assert.throws(()=>parseAnnotateCommand(bad),JSON.stringify(bad));
});
test('parseAnnotations is tolerant and internalTarget resolves places',()=>{
 assert.deepEqual(parseAnnotations({notes:[],links:[]}),{note:null,link:null});
 assert.deepEqual(parseAnnotations({notes:[{author:'a',text:'t',threaded:true,resolved:false,replies:[['b','r'],[1,2]]}],links:[{target:'https://a.io',tooltip:null}]}),{note:{author:'a',text:'t',threaded:true,resolved:false,replies:[['b','r']]},link:{target:'https://a.io',tooltip:null}});
 assert.deepEqual(parseAnnotations({notes:'x',links:7}),{note:null,link:null});
 assert.deepEqual(internalTarget("'My Sheet'!$b$2:C3"),{sheet:'My Sheet',address:'B2'});assert.equal(internalTarget('https://a.io/x!A1'),null);assert.equal(internalTarget('Sheet!ZZZZ'),null);
});
