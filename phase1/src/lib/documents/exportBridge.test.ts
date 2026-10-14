import test from 'node:test';
import assert from 'node:assert/strict';
import {confirmDocumentsSaveCopy,documentsExportReady,getDocumentsExportUi,patchDocumentsExportUi,registerDocumentsExport,requestDocumentsSaveCopy} from './exportBridge';
import {patchDocuments} from './store';

test('export is ready only with a live bridge, a ready document and no running save',()=>{
 assert.equal(documentsExportReady(),false,'no bridge registered');
 const off=registerDocumentsExport({savePdf:async()=>undefined,save:async()=>{}});
 patchDocuments({status:'ready',saving:false});
 assert.equal(documentsExportReady(),true);
 patchDocuments({saving:true});
 assert.equal(documentsExportReady(),false,'no repeat submission while saving');
 patchDocuments({saving:false,status:'loading'});
 assert.equal(documentsExportReady(),false);
 patchDocuments({status:'idle'});
 off();
});
test('risks route through the warning gate; Save anyway runs the one save path',async()=>{
 let saved=0;
 const off=registerDocumentsExport({savePdf:async()=>undefined,save:async()=>{saved++;}});
 patchDocuments({status:'ready',saving:false,risks:['charts']});
 patchDocumentsExportUi({confirmOpen:false});
 await requestDocumentsSaveCopy();
 assert.equal(saved,0,'the warning can never be skipped');
 assert.equal(getDocumentsExportUi().confirmOpen,true);
 await confirmDocumentsSaveCopy();
 assert.equal(saved,1);
 assert.equal(getDocumentsExportUi().confirmOpen,false);
 patchDocuments({risks:[]});
 await requestDocumentsSaveCopy();
 assert.equal(saved,2,'no risks: saves directly');
 patchDocuments({status:'idle'});
 off();
});
test('a missing bridge or a busy save never throws and never saves',async()=>{
 patchDocuments({status:'ready',saving:true});
 await requestDocumentsSaveCopy();
 assert.equal(getDocumentsExportUi().confirmOpen,false);
 patchDocuments({status:'idle',saving:false});
});
