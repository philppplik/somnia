import {useMemo} from 'react';
import {patchState,useAppStore} from '../../store/appStore';
import {createDefaultHost} from '../../lib/extensions/popupHostDefault';
import {getBlocklistService} from '../../lib/extensions/blocklistWiring';
import {ExtensionsPopup} from './ExtensionsPopup';

/** Mounted once in the app frame. Opens from the rail, command palette and the Settings pointer. */
export function ExtensionsPopupMount(){
 const open=useAppStore().extensionsOpen;const host=useMemo(()=>createDefaultHost({blocklist:getBlocklistService}),[]);
 return open?<ExtensionsPopup open host={host} onClose={()=>patchState({extensionsOpen:false})}/>:null;
}
