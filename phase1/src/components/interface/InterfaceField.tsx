import {useState} from 'react';
import {InspectorNumberField} from '../studios/InspectorNumberField';
import {Field as DSField} from '../ui/field';
/** The DS number field keeps its draft while the committed value is unchanged. When the command rejects the draft (e.g. width -1, "Invalid geometry"),
 *  the value never changes, so the draft would stay visible. Remounting after each commit attempt shows the real value again, like the old native field did. */
function NumberFieldAttempt({name,value,disabled,onCommit}:{name:string;value:string|number;disabled?:boolean;onCommit:(value:string)=>void}){
 const [attempt,setAttempt]=useState(0);
 return <InspectorNumberField key={`${name}:${value}:${attempt}`} label={name} value={Number(value)} disabled={disabled} className="min-w-0 rounded border border-subtle bg-panel p-2 text-ink focus-visible:outline-accent" onCommit={next=>{try{onCommit(String(next));}finally{setAttempt(a=>a+1);}}}/>;
}
export function Field({name,value,type='text',disabled,onCommit}:{name:string;value:string|number;type?:string;disabled?:boolean;onCommit:(value:string)=>void}){
 if(type==='number')return <NumberFieldAttempt name={name} value={value} disabled={disabled} onCommit={onCommit}/>;
 return <DSField label={name} className="flex min-w-0 flex-col gap-1 text-xs">{control=><input {...control} key={`${name}:${value}`} className="min-w-0 rounded border border-subtle bg-panel p-2 text-ink focus-visible:outline-accent" type={type} defaultValue={value} disabled={disabled} onBlur={e=>{if(e.currentTarget.value!==String(value)){onCommit(e.currentTarget.value);e.currentTarget.value=String(value);}}} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();if(e.key==='Escape'){e.currentTarget.value=String(value);e.currentTarget.blur();}}}/>}</DSField>;
}
