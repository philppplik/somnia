/** Explicit offline browser fixture entry. Not imported by production exports. */
import {createRoot} from 'react-dom/client';
import {VibeSpaceHome} from './index';
import {createFixtureVibeSpaceTransport} from '../../lib/vibespace/fixture';
const transport=createFixtureVibeSpaceTransport('test', (window as unknown as {vibeEmpty?:boolean}).vibeEmpty?{revision:1,spaces:[],sessions:[],studios:[],models:[]}:undefined);
Object.assign(window,{vibeFixture:transport});
createRoot(document.getElementById('root')!).render(<VibeSpaceHome transport={transport}/>);
