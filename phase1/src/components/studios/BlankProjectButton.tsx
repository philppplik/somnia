import {useState} from 'react';
import {Button} from '../ui/button';
import {createBlankProject} from '../../lib/studios/blank';
export interface BlankProjectButtonProps {studioId:string;className?:string;label?:string}
/** Busy and error feedback stay beside the CTA. No file input and no hidden document replacement. */
export function BlankProjectButton({studioId,className,label='Create blank project'}:BlankProjectButtonProps){
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const create=async()=>{setBusy(true);setError('');try{await createBlankProject(studioId);}catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}};
 return <span className="inline-flex flex-col items-center gap-2"><Button className={className} variant="outline" disabled={busy} aria-busy={busy} onClick={()=>void create()} data-testid={`${studioId}-create-blank`}>{busy?'Creating project...':label}</Button>{error&&<span role="alert" className="max-w-sm text-[12px] text-red-600">{error}</span>}</span>;
}
