import {useState} from 'react';
import {InspectorNumberField} from '../../src/components/studios/InspectorNumberField';
import {Field as InterfaceField} from '../../src/components/interface/InterfaceField';
import {PanelSection} from '../../src/components/ui/panel';
/** Isolated adapters, not a fake studio engine. Commands/session writes are outside this fixture. */
export function StudioAdoptionProof(){
 const [value,setValue]=useState(10),[identity,setIdentity]=useState(1),[events,setEvents]=useState<string[]>([]),[open,setOpen]=useState(true),[disabled,setDisabled]=useState(false),[text,setText]=useState('Layer');
 return <section data-testid="studio-adoption-proof"><h2>New-studio inspector adapters</h2>
  <button onClick={()=>setIdentity(i=>i+1)}>Change selection identity</button><button onClick={()=>setDisabled(d=>!d)}>Toggle inspector lock</button>
  <InspectorNumberField label="Position X" value={value} min={-100} max={100} step={0.1} resetKey={identity} disabled={disabled} onCommit={next=>{setValue(next);setEvents(e=>[...e,`commit:${next}`]);}}/>
  <InterfaceField name="Width" type="number" value={value} disabled={disabled} onCommit={next=>{setValue(Number(next));setEvents(e=>[...e,`interface:${next}`]);}}/>
  <InterfaceField name="Layer name" value={text} disabled={disabled} onCommit={next=>{setText(next);setEvents(e=>[...e,`name:${next}`]);}}/>
  <PanelSection title="Layout" id="adoption-layout" open={open} onOpenChange={setOpen}><span>Selection-scoped layout fields</span></PanelSection>
  <output data-testid="studio-adoption-events">{events.join('|')}</output>
 </section>;
}
