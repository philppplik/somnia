import test from 'node:test';
import assert from 'node:assert/strict';
import {copyName,MAX_COPY_NAME,safeCopyName} from './saveCopy';

test('typed copy names are made safe',()=>{
 assert.equal(safeCopyName('Report v2','a.docx'),'Report v2.docx');
 assert.equal(safeCopyName('Report.DOCX','a.docx'),'Report.docx');
 assert.equal(safeCopyName('../../etc/passwd','a.docx'),'passwd.docx');
 assert.equal(safeCopyName('C:\\x\\y:z?.docx','a.docx'),'yz.docx');
 assert.equal(safeCopyName('a\u0000b\nc','x.docx'),'abc.docx');
});
test('empty or dot-only names fall back to the default',()=>{
 assert.equal(safeCopyName('','Plan.docx'),copyName('Plan.docx'));
 assert.equal(safeCopyName('  ...  ','Plan.docx'),copyName('Plan.docx'));
 assert.equal(safeCopyName('.docx','Plan.docx'),copyName('Plan.docx'));
});
test('the name is bounded and never equals the original',()=>{
 assert.ok(safeCopyName('x'.repeat(5000),'a.docx').length<=MAX_COPY_NAME);
 assert.equal(safeCopyName('plan','Plan.docx'),'plan (copy).docx');
 assert.equal(safeCopyName('Plan.docx','dir/Plan.docx'),'Plan (copy).docx');
});
