import {useState} from 'react';
import {VectorToolsPanel} from '../../src/components/vectorstudio/tools/VectorToolsPanel';
import {VectorNodePanel} from '../../src/components/vectorstudio/tools/VectorNodePanel';
import {importSvg} from '../../src/lib/vectorio';

const doc=importSvg('<svg width="100" height="100"><rect x="10" y="20" width="30" height="40"/></svg>').doc;

/** Real migrated vectorstudio panels over a fixture document; commits are logged, never executed. */
export function VectorstudioProof(){
 const [events,setEvents]=useState<string[]>([]);
 const log=(entry:string)=>setEvents(old=>[...old,entry]);
 return <main data-testid="vectorstudio-proof"><h1>Vectorstudio DS adoption</h1><p>Actual tools and node panels on a fixture document; every control renders through native control primitives.</p>
  <VectorToolsPanel value={doc} selection={[doc.paths[0].id]} onSelectionChange={()=>{}} onCommit={c=>log(`commit:${c.label}`)} onToolChange={t=>log(`tool:${t}`)}/>
  <VectorNodePanel value={doc} nodeSelection={[{pathId:doc.paths[0].id,nodeId:doc.paths[0].nodes[0].id}]} onNodeSelectionChange={()=>{}} onCommit={c=>log(`node-commit:${c.label}`)}/>
  <pre data-testid="vectorstudio-proof-events" aria-label="Fixture events">{events.join('\n')}</pre></main>;
}
