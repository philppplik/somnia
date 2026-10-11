/** Offline browser fixture entry for the Memory panel + Skills tab. Not imported by production exports. */
import {createRoot} from 'react-dom/client';
import {MemoryPanel} from './MemoryPanel';
import {SkillsTab} from './SkillsTab';
import {createFixtureMemoryTransport,createFixtureSkillsTransport} from '../../lib/vibespace/memorySkillsFixture';
const w=window as unknown as {msLocale?:string;msView?:string};
const mem=createFixtureMemoryTransport(),sk=createFixtureSkillsTransport();
Object.assign(window,{memFixture:mem,skillsFixture:sk});
const locale=w.msLocale??'en';
createRoot(document.getElementById('root')!).render(w.msView==='skills'?<SkillsTab transport={sk} spaceId="space-1" locale={locale}/>:<MemoryPanel transport={mem} spaceId="space-1" locale={locale}/>);
