import {useEffect,useRef,useState} from 'react';
import type {ComponentProps} from 'react';
import {Field} from './field';
import type {FieldProps} from './field';
export type NumberParseResult={ok:true;value:number}|{ok:false;error:string};
export interface NumberFieldProps extends Omit<ComponentProps<'input'>,'type'|'value'|'defaultValue'|'onChange'|'onBlur'|'onKeyDown'|'children'> {
 label:FieldProps['label']; hint?:FieldProps['hint']; unit?:string;
 value:number|null; mixed?:boolean; mixedLabel?:string; resetKey?:string|number;
 parse:(draft:string)=>NumberParseResult; format?:(value:number)=>string;
 onCommit:(value:number)=>void; onCancel?:()=>void;
 /** Native limits are also applied after the caller's parser. */
 min?:number;max?:number;step?:number; constraintError:string;
}
/** Caller supplies domain parsing/units. Enter and blur commit once, Escape restores.
 * Null/mixed is an empty draft, never silently written as zero. */
export function NumberField({label,hint,unit,value,mixed=false,mixedLabel,resetKey,parse,format=String,onCommit,onCancel,min,max,step=1,constraintError,id,disabled,readOnly,...input}:NumberFieldProps){
 const shown=mixed||value===null?'':format(value);
 const [draft,setDraft]=useState(shown),[error,setError]=useState<string>();
 const accepted=useRef(shown);
 useEffect(()=>{setDraft(shown);accepted.current=shown;setError(undefined);},[shown,resetKey,mixed]);
 const commit=()=>{
  if(disabled||readOnly||draft===accepted.current)return;
  const parsed=parse(draft);
  if(!parsed.ok){setError(parsed.error);return;}
  // Out-of-range/invalid values are rejected through the caller's localized parser.
  if(!Number.isFinite(parsed.value)||(min!==undefined&&parsed.value<min)||(max!==undefined&&parsed.value>max)){setError(constraintError);return;}
  accepted.current=draft;setError(undefined);onCommit(parsed.value);
 };
 const restore=()=>{accepted.current=shown;setDraft(shown);setError(undefined);onCancel?.();};
 return <Field label={unit?<>{label} ({unit})</>:label} controlId={id} hint={hint} error={error}>{control=>
  <input {...input} {...control} aria-describedby={[input['aria-describedby'],control['aria-describedby']].filter(Boolean).join(' ')||undefined} data-slot="number-field" type="text" inputMode="decimal" value={draft}
   disabled={disabled} readOnly={readOnly} placeholder={mixed?mixedLabel:input.placeholder}
   onChange={e=>{setDraft(e.currentTarget.value);setError(undefined);}}
   onBlur={commit} onKeyDown={e=>{
    if(e.nativeEvent.isComposing)return;
    if(e.key==='Enter'){e.preventDefault();commit();}
    else if(e.key==='Escape'){e.preventDefault();restore();}
    else if((e.key==='ArrowUp'||e.key==='ArrowDown')&&!disabled&&!readOnly){
     const parsed=parse(draft);if(!parsed.ok||!Number.isFinite(parsed.value))return;
     e.preventDefault();const next=Math.min(max??Infinity,Math.max(min??-Infinity,parsed.value+(e.key==='ArrowUp'?step:-step)));
     const nextDraft=format(next);const checked=parse(nextDraft);if(!checked.ok){setError(checked.error);return;}if(!Number.isFinite(checked.value)||(min!==undefined&&checked.value<min)||(max!==undefined&&checked.value>max)){setError(constraintError);return;}
     setDraft(nextDraft);accepted.current=nextDraft;setError(undefined);onCommit(checked.value);
    }
   }}/>
 }</Field>;
}
