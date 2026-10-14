import {useEffect,useState} from 'react';
import {WindowControlButtons} from '../../src/components/WindowControls';
import {FileTabs} from '../../src/components/FileTabs';
import {CommandPalette} from '../../src/components/CommandPalette';
import {Button} from '../../src/components/ui/button';
import {patchState} from '../../src/store/appStore';
import {registerCommand} from '../../src/lib/commandRegistry';
export function ShellChromeProof(){const [events,setEvents]=useState<string[]>([]);const log=(value:string)=>setEvents(old=>[...old,value]);useEffect(()=>{patchState({activeStudio:'code',files:{'local.html':'local','other.css':'local'},openFiles:['local.html','other.css'],activeFile:'local.html',studioByTab:{},paletteOpen:false,recentCommands:[]});const off=registerCommand({id:'ds.chrome.local',title:'DS chrome local action',category:'Tools',run:()=>log('command')});const disabled=registerCommand({id:'ds.chrome.disabled',title:'DS chrome unavailable',category:'Tools',enabled:()=>false,run:()=>log('disabled-command')});return ()=>{off();disabled();patchState({paletteOpen:false});};},[]);return <main><h1>Shell chrome controls</h1><p>Real tab/palette components. Window control callbacks only record synthetic events; no native window mutation.</p><WindowControlButtons onMinimize={()=>log('minimize')} onMaximize={()=>log('maximize')} onClose={()=>log('close')}/><FileTabs/><Button onClick={()=>patchState({paletteOpen:true})}>Open chrome palette</Button><output data-testid="chrome-events">{events.join('|')}</output><CommandPalette/></main>;}
