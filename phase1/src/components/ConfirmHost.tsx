import {useSyncExternalStore} from 'react';
import {AlertTriangle} from 'lucide-react';
import {ConfirmShell} from './ConfirmShell';
import {Button} from './ui/button';
import {answerConfirm,getConfirmSnapshot,subscribeConfirm} from '../lib/confirmService';
import {useT} from '../lib/useT';

/** Modal host for the app-level async confirm service. Cancel is the default action. */
export function ConfirmHost(){
 const req=useSyncExternalStore(subscribeConfirm,getConfirmSnapshot);
 const {t}=useT();
 if(!req)return null;
 return <ConfirmShell open onCancel={()=>answerConfirm(false)} tone={req.destructive?'warning':'accent'} Icon={AlertTriangle} ariaLabel={req.title} title={req.title} description={req.message} body={<></>}
  footer={<><Button className="dlg-cancel" autoFocus onClick={()=>answerConfirm(false)}>{req.cancelLabel??t('dialogs.cancel')}</Button><span className="dlg-spacer"/><Button className={req.destructive?'dlg-danger':''} variant={req.destructive?undefined:'primary'} onClick={()=>answerConfirm(true)}>{req.confirmLabel??'OK'}</Button></>}/>;
}
