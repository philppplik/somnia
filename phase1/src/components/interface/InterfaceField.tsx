import {InspectorNumberField} from '../studios/InspectorNumberField';
import {Field as DSField} from '../ui/field';
export function Field({name,value,type='text',disabled,onCommit}:{name:string;value:string|number;type?:string;disabled?:boolean;onCommit:(value:string)=>void}){
 if(type==='number')return <InspectorNumberField label={name} value={Number(value)} disabled={disabled} className="min-w-0 rounded border border-subtle bg-panel p-2 text-ink focus-visible:outline-accent" onCommit={next=>onCommit(String(next))}/>;
 return <DSField label={name} className="flex min-w-0 flex-col gap-1 text-xs">{control=><input {...control} key={`${name}:${value}`} className="min-w-0 rounded border border-subtle bg-panel p-2 text-ink focus-visible:outline-accent" type={type} defaultValue={value} disabled={disabled} onBlur={e=>{if(e.currentTarget.value!==String(value)){onCommit(e.currentTarget.value);e.currentTarget.value=String(value);}}} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();if(e.key==='Escape'){e.currentTarget.value=String(value);e.currentTarget.blur();}}}/>}</DSField>;
}
