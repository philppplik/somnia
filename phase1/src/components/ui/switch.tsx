import type {ComponentProps,ReactNode} from 'react';
import {Field} from './field';
/** Native checkbox-backed switch. Caller owns checked state, locale and persistence. */
export function Switch({label,hint,error,id,...props}:Omit<ComponentProps<'input'>,'type'|'role'|'children'>&{label:ReactNode;hint?:ReactNode;error?:ReactNode}){
 return <Field label={label} controlId={id} hint={hint} error={error}>{control=><input {...props} {...control} type="checkbox" role="switch" data-slot="switch"/>}</Field>;
}
