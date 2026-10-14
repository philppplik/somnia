import {useMemo} from 'react';
import {VibeSpaceHome} from '../../src/components/vibespace/VibeSpaceHome';
import {createFixtureVibeSpaceTransport} from '../../src/lib/vibespace/fixture';
import {StudioEmptyState} from '../../src/components/studios/StudioEmptyState';
import {StudioStatus} from '../../src/components/studios/StudioStatus';
import '../../src/components/vibespace/vibespace.css';
export function StateAdoptionProof(){const transport=useMemo(()=>createFixtureVibeSpaceTransport('test',{revision:1,spaces:[],sessions:[],studios:[],models:[]}),[]);return <main><h1>New studio state adoption</h1><p>Actual Vibe home with empty offline transport; no project writes. Disabled starter and status examples below are presentation-only.</p><VibeSpaceHome transport={transport}/><StudioEmptyState studio="vibespace" disabled icon={<span>AI</span>} onOpen={()=>{throw Error('Disabled action must not run');}} testId="disabled-vibe-starter"/><StudioStatus className="block p-3">Loading local state</StudioStatus><StudioStatus tone="error" live="assertive" className="block p-3">Local read failed. No fallback state.</StudioStatus></main>;}
