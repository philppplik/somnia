import test from 'node:test';
import assert from 'node:assert/strict';
import {strFromU8,unzipSync} from 'fflate';
import {artboardArchive,exportName} from './exportArtboards';
import {createDesignDocument} from './model';
test('ZIP contains one valid SVG per board with safe unique file names, no model mutation',()=>{
 const doc=createDesignDocument();doc.artboards.push({...structuredClone(doc.artboards[0]),id:'other'});doc.artboards.forEach(b=>b.name='../same/name');
 const before=JSON.stringify(doc),files=unzipSync(artboardArchive(doc));
 assert.deepEqual(Object.keys(files),['1-_same_name.svg','2-_same_name.svg']);
 for(const bytes of Object.values(files))assert.match(strFromU8(bytes),/<svg/);
 assert.equal(JSON.stringify(doc),before);assert.equal(exportName('...'),'artboard');
});
