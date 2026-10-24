import {useEffect} from 'react';
import {registerVibeSpaceCommands} from '../../lib/vibespace/commands';
import {isTauri} from '@tauri-apps/api/core';
import {VibeSpaceHome} from './VibeSpaceHome';
import {desktopVibeSpaceTransport} from '../../lib/vibespace/desktopBindings';
import './vibespace.css';
/** Native-only entry. A failed command never switches to a fake fixture backend. */
export function DesktopVibeSpacePanel(){
 const native=isTauri();
 useEffect(()=>{if(!native)return registerVibeSpaceCommands();},[native]);
 if(!native)return <div className="vs-home" role="status"><h2>Vibe Space</h2><p>Open the desktop app to use persistent Vibe Spaces. No agent runs in this browser preview.</p></div>;
 return <VibeSpaceHome transport={desktopVibeSpaceTransport}/>;
}
