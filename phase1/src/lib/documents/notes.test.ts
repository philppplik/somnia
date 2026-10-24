import test from 'node:test';
import assert from 'node:assert/strict';
import {footnoteRefsIn,footnoteNoteNum,scanFootnotes,nextFootnoteNumber,planFootnoteRenumber,figureCaptionNum,nextFigureNumber,planFigureRenumber,noteByteLen,FOOTNOTE_HEADING} from './notes';
const para=(index:number,text:string)=>({index,kind:'para',editable:true,text});

test('footnoteRefsIn finds inline refs but not note definitions',()=>{
 assert.deepEqual(footnoteRefsIn('See this[^1] and that[^23].'),[{num:1,start:8,end:12},{num:23,start:21,end:26}]);
 assert.deepEqual(footnoteRefsIn('[^1]: the note'),[]);
 assert.deepEqual(footnoteRefsIn('no notes'),[]);
});

test('footnoteNoteNum reads note paragraph prefixes',()=>{
 assert.equal(footnoteNoteNum('[^3]: third note'),3);
 assert.equal(footnoteNoteNum('[^3] not a note'),null);
 assert.equal(footnoteNoteNum('text'),null);
});

test('scanFootnotes collects refs, notes and heading in order',()=>{
 const s=scanFootnotes([para(0,'Alpha[^1].'),para(1,'Beta[^2] and again[^1].'),para(2,'Footnotes'),para(3,'[^1]: first'),para(4,'[^2]: second')]);
 assert.deepEqual(s.refs.map(r=>[r.block,r.num]),[[0,1],[1,2],[1,1]]);
 assert.deepEqual(s.notes.map(n=>[n.block,n.num]),[[3,1],[4,2]]);
 assert.equal(s.heading,2);
 assert.equal(s.maxNum,2);
 assert.equal(nextFootnoteNumber(s),3);
});

test('planFootnoteRenumber renumbers by first appearance and keeps shared refs',()=>{
 const blocks=[para(0,'Later[^7] then earlier[^3].'),para(1,'Footnotes'),para(2,'[^7]: seven'),para(3,'[^3]: three')];
 const edits=planFootnoteRenumber(blocks);
 assert.deepEqual(edits,[
  {block:0,hunks:[{start:noteByteLen('Later[^'),end:noteByteLen('Later[^7'),text:'1'},{start:noteByteLen('Later[^7] then earlier[^'),end:noteByteLen('Later[^7] then earlier[^3'),text:'2'}]},
  {block:2,hunks:[{start:2,end:3,text:'1'}]},
  {block:3,hunks:[{start:2,end:3,text:'2'}]},
 ]);
 // Applying the edits yields sequential numbering.
 const apply=(t:string,hs:{start:number;end:number;text:string}[])=>{const b=new TextEncoder().encode(t);let out='';let at=0;for(const h of hs){out+=new TextDecoder().decode(b.slice(at,h.start))+h.text;at=h.end;}return out+new TextDecoder().decode(b.slice(at));};
 const next=blocks.map(b=>{const e=edits.find(x=>x.block===b.index);return e?apply(b.text,e.hunks):b.text;});
 assert.deepEqual(planFootnoteRenumber(next.map((t,i)=>para(i,t))),[]);
});

test('planFootnoteRenumber leaves ordered and empty documents alone',()=>{
 assert.deepEqual(planFootnoteRenumber([para(0,'A[^1] B[^2].'),para(1,'Footnotes'),para(2,'[^1]: a'),para(3,'[^2]: b')]),[]);
 assert.deepEqual(planFootnoteRenumber([para(0,'plain')]),[]);
});

test('figure captions scan and renumber',()=>{
 const blocks=[para(0,'intro'),para(1,'Figure 4: first'),para(2,'Figure 9: second'),para(3,'Figure not a caption')];
 assert.equal(figureCaptionNum('Figure 12: caption'),12);
 assert.equal(figureCaptionNum('Figure 1 caption'),null);
 assert.equal(nextFigureNumber(blocks),10);
 assert.deepEqual(planFigureRenumber(blocks),[
  {block:1,hunks:[{start:7,end:8,text:'1'}]},
  {block:2,hunks:[{start:7,end:8,text:'2'}]},
 ]);
 assert.deepEqual(planFigureRenumber([para(0,'Figure 1: a'),para(1,'Figure 2: b')]),[]);
});
