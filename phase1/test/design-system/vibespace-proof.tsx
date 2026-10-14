import {useState} from 'react';
import {BoardView} from '../../src/components/vibespace/BoardView';
import {CreateStudioForm} from '../../src/components/vibespace/CreateForms';
import {ModelSetup} from '../../src/components/vibespace/ModelSetup';
import {fixtureSnapshot,fixtureSpace} from '../../src/lib/vibespace/fixture';
import '../../src/components/vibespace/vibespace.css';

const ALL:readonly any[]=['create-space','create-studio','start','stop','steer','consent','review','restore','retry','apply-hunks','request-changes'];
const NOW=new Date('2026-10-11T12:00:00Z').getTime();

/** Real migrated vibespace surfaces over fixtures; actions are logged, never executed. */
export function VibespaceProof(){
 const [pending,setPending]=useState(false);
 const [events,setEvents]=useState<string[]>([]);
 const log=(entry:string)=>setEvents(old=>[...old,entry]);
 return <main data-testid="vibespace-proof"><h1>Vibespace DS adoption</h1><p>Actual board and forms on fixtures; every control renders through native control primitives.</p>
  <div className="controls"><button onClick={()=>setPending(p=>!p)} aria-pressed={pending}>Pending</button></div>
  <div className="vs-root"><BoardView space={fixtureSpace} snapshot={fixtureSnapshot()} schedules={null} schedulesError={false} pending={pending} capabilities={ALL} mode="fixture" onAction={async a=>{log(`action:${a.type}`);return true;}} onOpenRun={id=>log(`open:${id}`)} nowMs={NOW}/>
  <CreateStudioForm space={fixtureSpace} models={fixtureSnapshot().models} busy={false} onCreate={async()=>{log('create-studio');return true;}} onClose={()=>log('close')}/>
  <ModelSetup probe={async()=>({state:'server-down',hintKey:'vs.model.hint.ollamaDown'})}/></div>
  <pre data-testid="vibespace-proof-events" aria-label="Fixture events">{events.join('\n')}</pre></main>;
}
