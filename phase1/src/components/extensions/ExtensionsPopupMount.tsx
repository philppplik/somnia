import {useMemo} from 'react';
import {patchState,useAppStore} from '../../store/appStore';
import {createDefaultHost} from '../../lib/extensions/popupHostDefault';
import {getCatalogBlocklist} from '../../lib/extensions/catalogBlocklist';
import {ExtensionsPopup} from './ExtensionsPopup';

/** Mounted once in the app frame. Opens from the rail, command palette and the Settings pointer.
 * The blocklist gate is the catalog-backed service: blocked extensions can neither run nor be re-enabled. */
export function ExtensionsPopupMount(){
 const open=useAppStore().extensionsOpen;const host=useMemo(()=>createDefaultHost({blocklist:getCatalogBlocklist}),[]);
 return open?<ExtensionsPopup open host={host} onClose={()=>patchState({extensionsOpen:false})}/>:null;
}
