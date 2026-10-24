import {useState} from 'react';
import {PdfEditInspector} from '../../src/components/pdf/PdfEditInspector';
import {PDF_EDIT_SCHEMA,type PdfEditCommand,type PdfEditDocument} from '../../src/lib/pdf/model';
import type {PdfFieldInfo} from '../../src/lib/pdfforms/types';
import '../../src/components/pdf/pdf-edit.css';

const doc:PdfEditDocument={schema:PDF_EDIT_SCHEMA,sourcePageCount:3,
 pages:[{sourcePage:0,rotation:0},{sourcePage:1,rotation:90},{sourcePage:2,rotation:0}],
 annotations:[{id:'a1',sourcePage:0,kind:'highlight',rect:{x:40,y:40,width:180,height:40},text:'',color:[1,0.9,0.2],opacity:0.4,fontSize:12}],
 fieldValues:{}};
const fields:readonly PdfFieldInfo[]=[
 {name:'title',kind:'text',value:'Quarterly report',readOnly:false,required:true},
 {name:'approved',kind:'checkbox',value:false,readOnly:false,required:false},
 {name:'category',kind:'dropdown',value:'Finance',options:['Finance','Legal','HR'],readOnly:false,required:false},
];

/** Real migrated pdf/pdfedit inspector over a fixture document; commands are logged, never executed. */
export function PdfProof(){
 const [disabled,setDisabled]=useState(false);
 const [events,setEvents]=useState<string[]>([]);
 const log=(entry:string)=>setEvents(old=>[...old,entry]);
 const onCommand=(c:PdfEditCommand)=>log(`command:${c.kind}`);
 return <main data-testid="pdf-proof"><h1>Pdf/pdfedit DS adoption</h1><p>Actual edit inspector on a fixture document; every control renders through native control primitives.</p>
  <div className="controls"><button onClick={()=>setDisabled(d=>!d)} aria-pressed={disabled}>Disabled</button></div>
  <PdfEditInspector document={doc} locale="en" fields={fields} activeSourcePage={1}
   onSelectPage={n=>log(`select:${n}`)} onCommand={onCommand} onExport={()=>log('export')} onExtract={pages=>log(`extract:${pages.join(',')}`)}
   onUndo={()=>log('undo')} onRedo={()=>log('redo')} canUndo={true} canRedo={false} disabled={disabled}/>
  <pre data-testid="pdf-proof-events" aria-label="Fixture events">{events.join('\n')}</pre></main>;
}
