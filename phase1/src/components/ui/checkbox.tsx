import type {ComponentProps,ReactNode} from 'react';
import {useEffect,useRef} from 'react';
import {Field} from './field';
export interface CheckboxProps extends Omit<ComponentProps<'input'>,'type'|'children'> {label:ReactNode;hint?:ReactNode;error?:ReactNode;indeterminate?:boolean}
/** Native checkbox parity. Mixed state is visual/semantic only, not a third saved value. */
export function Checkbox({label,hint,error,indeterminate=false,id,ref,...props}:CheckboxProps){
 const local=useRef<HTMLInputElement|null>(null);
 useEffect(()=>{if(local.current)local.current.indeterminate=indeterminate;},[indeterminate]);
 return <Field label={label} controlId={id} hint={hint} error={error}>{control=><input {...props} {...control} type="checkbox" data-slot="checkbox" aria-checked={indeterminate?'mixed':props.checked} ref={node=>{local.current=node;if(typeof ref==='function')return ref(node);if(ref)ref.current=node;}}/>}</Field>;
}
