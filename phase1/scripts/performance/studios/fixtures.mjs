import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {unzipSync} from 'fflate';
export function fixtureInventory(root){
 return ['test/documents/sample.docx','test/documents/large.docx','sheets-craft/fixtures/fixture.xlsx','sheets-craft/fixtures/formats.xlsx'].map(path=>{
  const bytes=readFileSync(`${root}/${path}`),parts=unzipSync(bytes);
  return {path,sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length,expandedBytes:Object.values(parts).reduce((n,p)=>n+p.byteLength,0),parts:Object.keys(parts).length,provenance:'Repository-owned test fixture; no private project data'};
 });
}
