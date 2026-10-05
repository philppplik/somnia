import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mapPreviewErrorLocation,type PreviewScriptLocation} from './previewErrorLocation';
const script:PreviewScriptLocation={file:'pages/a.html',url:'somnia-preview://script/id/0/pages%2Fa.html',sourceLine:10,sourceCol:9,generatedLine:4,generatedCol:25,content:'throw new Error();\nmissing();'};
test('maps sourceURL coordinates, including first-line column offset',()=>{
 assert.deepEqual(mapPreviewErrorLocation({message:'error',filename:script.url,line:1,col:7},[script]),{file:'pages/a.html',line:10,col:15});
 assert.deepEqual(mapPreviewErrorLocation({message:'error',filename:script.url,line:2,col:2},[script]),{file:'pages/a.html',line:11,col:2});
});
test('maps srcDoc and Chromium syntax coordinates, including same-line script offsets',()=>{
 for(const filename of ['about:srcdoc',script.url])assert.deepEqual(mapPreviewErrorLocation({message:'syntax',filename,line:4,col:31,syntax:true},[script]),{file:'pages/a.html',line:10,col:15});
});
test('finds project rejection frames and ignores unmapped frames',()=>{
 assert.deepEqual(mapPreviewErrorLocation({message:'promise',stack:`Error: boom\n    at unknown:1:2\n    at ${script.url}:2:3`},[script]),{file:'pages/a.html',line:11,col:3});
});
test('does not map non-project, non-integer, injected or out-of-range positions',()=>{
 for(const e of [{filename:'https://x.test/file.js',line:1,col:1},{filename:script.url,line:200,col:1},{filename:script.url,line:1,col:100},{filename:script.url,line:0,col:1},{filename:script.url,line:1.5,col:1},{filename:script.url,line:1,col:0},{filename:'about:srcdoc',line:1,col:1},{stack:'Error: boom\n    at about:srcdoc:4:25'}])assert.equal(mapPreviewErrorLocation({message:'error',...e},[script]),null);
});
