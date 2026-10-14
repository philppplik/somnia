import {useId} from 'react';
import type {HTMLAttributes, ReactNode} from 'react';
import {cn} from '../../lib/cn';
export interface FieldControlProps {id:string; 'aria-describedby'?:string; 'aria-invalid'?:true}
export interface FieldProps extends Omit<HTMLAttributes<HTMLDivElement>,'children'> {
 label:ReactNode; controlId?:string; hint?:ReactNode; error?:ReactNode;
 children:(control:FieldControlProps)=>ReactNode;
}
/** Owns only label/message relationships. Parsing, transactions and copy belong to callers. */
export function Field({label,controlId,hint,error,children,className,...props}:FieldProps){
 const generated=useId(),id=controlId??`field-${generated}`,hintId=`${id}-hint`,errorId=`${id}-error`;
 const description=[hint?hintId:'',error?errorId:''].filter(Boolean).join(' ')||undefined;
 return <div data-slot="field" className={cn('ds-field',className)} {...props}>
  <label htmlFor={id} data-slot="field-label">{label}</label>
  {children({id,'aria-describedby':description,'aria-invalid':error?true:undefined})}
  {hint&&<FieldMessage id={hintId}>{hint}</FieldMessage>}
  {error&&<FieldMessage id={errorId} error>{error}</FieldMessage>}
 </div>;
}
export function FieldMessage({error=false,className,...props}:HTMLAttributes<HTMLParagraphElement>&{error?:boolean}){
 return <p data-slot="field-message" data-error={error||undefined} role={error?'alert':undefined} className={cn('ds-field-message',className)} {...props}/>;
}
