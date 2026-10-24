import {useMemo,useState} from 'react';
import {InstalledView} from '../../src/components/extensions/InstalledDetail';
import {ExtensionActivityTable} from '../../src/components/extensions/AddBrowseActivity';
import {ExtensionNav,NetworkNotice} from '../../src/components/extensions/parts';
import {TabList} from '../../src/components/extensions/StoreParts';
import {FIXTURE_EVENTS,FIXTURE_EXTENSIONS,fixtureHost} from '../../src/lib/extensions/popupFixtures';
import type {StateFilter} from '../../src/lib/extensions/popupModel';
import '../../src/styles/extensions-popup.css';
import '../../src/styles/extensions-store.css';

/** Real migrated extensions surfaces over fixture hosts. No store, consent or engine writes. */
export function ExtensionsProof(){
 const [query,setQuery]=useState('');const [filter,setFilter]=useState<StateFilter>('all');const [tab,setTab]=useState('access');
 const [events,setEvents]=useState<string[]>([]);const [revision,setRevision]=useState(0);
 const host=useMemo(()=>fixtureHost({setEnabled:async(id,on)=>{setEvents(old=>[...old,`setEnabled:${id}:${on}`]);}}),[]);
 const changed=()=>setRevision(n=>n+1);
 return <main data-testid="extensions-proof" key={revision}><h1>Extensions DS adoption</h1><p>Actual popup surfaces on fixture hosts; every control renders through native control primitives.</p>
  <NetworkNotice onViewActivity={()=>setEvents(old=>[...old,'notice:activity'])}/>
  <ExtensionNav view="installed" counts={{installed:FIXTURE_EXTENSIONS.length,updates:1}} onSelect={v=>setEvents(old=>[...old,`nav:${v}`])} onAdd={()=>setEvents(old=>[...old,'nav:add'])}/>
  <InstalledView list={FIXTURE_EXTENSIONS} host={host} query={query} setQuery={setQuery} filter={filter} setFilter={setFilter} onOpen={(id,section)=>setEvents(old=>[...old,`open:${id}${section?`:${section}`:''}`])} onBrowse={()=>{}} onAdd={()=>{}} onChanged={changed}/>
  <h2>Activity</h2><ExtensionActivityTable events={FIXTURE_EVENTS} tz="UTC"/>
  <h2>Store tabs</h2><TabList idPrefix="store-proof" label="Store detail tabs" value={tab} onChange={setTab} tabs={[{id:'overview',label:'Overview'},{id:'access',label:'Access'},{id:'evidence',label:'Evidence'}]}/>
  <pre data-testid="extensions-proof-events" aria-label="Fixture events">{events.join('\n')}</pre></main>;
}
