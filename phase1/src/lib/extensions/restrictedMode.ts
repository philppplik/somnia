import {SECURITY_STORE_KEY,type ConsentStorage} from './permissionBroker';
/** Read-only startup gate for the legacy host while v2 broker integration lands.
 * Missing, corrupt or inaccessible consent data always means Restricted Mode.
 */
export function extensionsRestricted(storage:Pick<ConsentStorage,'getItem'>):boolean {
  try {
    const raw=storage.getItem(SECURITY_STORE_KEY);if(!raw||raw.length>4*1024*1024)return true;
    const state=JSON.parse(raw);return state.version!==2||state.acknowledged!==true||state.restricted!==false;
  }catch{return true;}
}
