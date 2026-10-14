import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseSize} from './TableSizeDialog';

test('parseSize accepts whole numbers inside the bound and rejects everything else',()=>{
 assert.equal(parseSize('1',20),1);assert.equal(parseSize('20',20),20);assert.equal(parseSize('7',10),7);
 for(const bad of ['','0','21','-1','1.5','1e1',' 3','3 ','abc','００３','0003','999','1000','٣'])assert.equal(parseSize(bad,20),null,JSON.stringify(bad));
});
