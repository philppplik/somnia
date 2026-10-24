import {useEffect,useState} from 'react';
import {patchDocuments,resetDocuments} from '../../src/lib/documents/store';
import {studioContextStore} from '../../src/lib/shell/studioContext';
import {attachEngine} from '../../src/lib/documents/session';
import type {DocumentsEngine} from '../../src/lib/documents/engine';
import {DocumentsOutlinePanel,DocumentsFindPanel,DocumentsInfoPanel,DocumentsSelectionPanel} from '../../src/components/documents/DocumentsPanelContents';
import type {StudioContext} from '../../src/lib/shell/types';

/** Real migrated documents panels over a fixture document in the documents store. */
export function DocumentsProof(){
 const [context,setContext]=useState<StudioContext|null>(null);
 useEffect(()=>{
  attachEngine({} as DocumentsEngine);
  patchDocuments({status:'ready',name:'proof.docx',pages:2,words:3,blocks:[{index:0,kind:'para',editable:true,text:'Proof paragraph'},{index:1,kind:'table',editable:false}],caret:{block:0,anchor:0,head:2},risks:['images'],pageSizes:[{width:595,height:842}]});
  const owner=studioContextStore.claim('documents',{id:'proof.docx',kind:'docx',dirty:false,readOnly:false});
  owner.report({selection:{kind:'one',count:1,type:'paragraph',ids:['p0']},data:{block:0}});
  setContext(studioContextStore.get());
  return()=>{owner.release();attachEngine(null);resetDocuments();};
 },[]);
 if(!context)return null;
 return <main data-testid="documents-proof"><h1>Documents DS adoption</h1><p>Actual outline, find, info and selection panels on a fixture document; every control renders through native control primitives.</p>
  <DocumentsFindPanel panelId="find" context={context}/>
  <DocumentsInfoPanel sectionId="document" context={context}/>
  <DocumentsSelectionPanel sectionId="selection" context={context}/>
  <DocumentsOutlinePanel panelId="outline" context={context}/></main>;
}
