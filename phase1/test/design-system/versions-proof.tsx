import {useEffect,useState} from 'react';
import {createFakeBackend,fakeChange} from '../../src/components/versions/fakeBackend';
import {ChangesController} from '../../src/components/versions/controller';
import {ChangesView} from '../../src/components/versions/ChangesTab';
import {VersionPicker} from '../../src/components/versions/VersionPicker';
import {translate} from '../../src/lib/i18n';

const t=(k:string,p?:Record<string,string|number>)=>translate('en',k,p);

/** Real migrated versions panels over the fake git backend fixture. */
export function VersionsProof(){
 const [ready,setReady]=useState<{c:ChangesController;b:ReturnType<typeof createFakeBackend>;n:number}|null>(null);
 useEffect(()=>{
  const b=createFakeBackend({changes:[fakeChange('index.html'),fakeChange('css/site.css'),fakeChange('proof.md',{kind:'untracked'})]});
  const c=new ChangesController(b,t);
  const unsub=c.subscribe(()=>setReady(x=>x?{...x,n:x.n+1}:x));
  void c.refresh().then(()=>setReady({c,b,n:0}));
  return unsub;
 },[]);
 if(!ready)return null;
 return <main data-testid="versions-proof"><h1>Versions DS adoption</h1><p>Actual changes view and version picker on the fake backend fixture; every control renders through native control primitives.</p>
  <ChangesView backend={ready.b} s={ready.c.getState()} c={ready.c} t={t} unsavedFiles={0} advanced onSaveFiles={()=>{}}/>
  <VersionPicker backend={ready.b} onChange={()=>{}}/></main>;
}
