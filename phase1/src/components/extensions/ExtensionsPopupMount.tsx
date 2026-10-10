import {useMemo} from 'react';
import {patchState,useAppStore} from '../../store/appStore';
import {createDefaultHost} from '../../lib/extensions/popupHostDefault';
import {ExtensionsPopup} from './ExtensionsPopup';

/** Mounted once in the app frame. Opens from the rail, command palette and the Settings pointer. */
export function ExtensionsPopupMount(){
 const open=useAppStore().extensionsOpen;const host=useMemo(createDefaultHost,[]);
 return open?<ExtensionsPopup open host={host} onClose={()=>patchState({extensionsOpen:false})}/>:null;
}
