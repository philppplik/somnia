import {useState} from 'react';
import {t} from '../../lib/i18n';
import {nativeScheduleTransport,type ScheduleTransport} from '../../lib/vibespace/schedule';
import {ScheduleDialog} from './ScheduleDialog';
import {NativeButton} from '../ui/native-controls';
export function StudioScheduleButton({studioId,disabled=false,transport=nativeScheduleTransport}:{studioId:string;disabled?:boolean;transport?:ScheduleTransport}){
 const [open,setOpen]=useState(false);
 return <><NativeButton type="button" disabled={disabled} onClick={()=>setOpen(true)}>{t('vs.schedule.open')}</NativeButton>{open&&<ScheduleDialog studioId={studioId} transport={transport} onClose={()=>setOpen(false)}/>}</>;
}
