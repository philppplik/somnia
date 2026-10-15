import {test} from 'node:test';
import assert from 'node:assert/strict';
import {unzipSync,zipSync,strFromU8,strToU8} from 'fflate';
import {writeDeckCoreProperties} from './deckCoreProps';
const TYPES='<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"></Types>';
const CORE='<?xml version="1.0"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Old</dc:title></cp:coreProperties>';
const deck=(parts:Record<string,string>)=>zipSync(Object.fromEntries(Object.entries(parts).map(([k,v])=>[k,strToU8(v)])));
test('writes title, author and description into an existing core.xml, replacing old values',()=>{
 const out=writeDeckCoreProperties(deck({'[Content_Types].xml':TYPES,'docProps/core.xml':CORE}),{title:'New & <T>',author:'Philipp',description:'Line1\nLine2'});
 const core=strFromU8(unzipSync(out)['docProps/core.xml']);
 assert.match(core,/<dc:title>New &amp; &lt;T&gt;<\/dc:title>/);
 assert.match(core,/<dc:creator>Philipp<\/dc:creator>/);
 assert.match(core,/<dc:description>Line1 Line2<\/dc:description>/);
 assert.equal(core.match(/<dc:title>/g)!.length,1);
});
test('creates core.xml and its content-type override when missing',()=>{
 const out=writeDeckCoreProperties(deck({'[Content_Types].xml':TYPES,'ppt/presentation.xml':'<p:presentation/>'}),{title:'T',author:'',description:''});
 const zip=unzipSync(out);
 assert.match(strFromU8(zip['docProps/core.xml']),/<dc:title>T<\/dc:title>/);
 assert.match(strFromU8(zip['[Content_Types].xml']),/PartName="\/docProps\/core\.xml"/);
 assert.equal(zip['ppt/presentation.xml']!==undefined,true);
});
test('empty metadata returns the bytes untouched',()=>{
 const bytes=deck({'[Content_Types].xml':TYPES});
 const out=writeDeckCoreProperties(bytes,{title:' ',author:'',description:''});
 assert.deepEqual([...out],[...bytes]);
});
test('caps a field at 512 chars and strips newlines',()=>{
 const out=writeDeckCoreProperties(deck({'[Content_Types].xml':TYPES,'docProps/core.xml':CORE}),{title:'x'.repeat(600),author:'',description:''});
 const m=strFromU8(unzipSync(out)['docProps/core.xml']).match(/<dc:title>(x+)<\/dc:title>/);
 assert.equal(m?.[1].length,512);
});
