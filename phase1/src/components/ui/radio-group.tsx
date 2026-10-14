import {useId} from 'react';
import type {ComponentProps,ReactNode} from 'react';
export interface RadioOption {value:string;label:ReactNode;disabled?:boolean;id?:string}
/** Native radio keyboard/form behavior; not a custom roving-tabindex implementation. */
export function RadioGroup({label,options,name,value,onValueChange,disabled=false,readOnly=false,id,...props}:Omit<ComponentProps<'fieldset'>,'onChange'|'children'>&{label:ReactNode;options:readonly RadioOption[];name?:string;value:string;onValueChange:(value:string)=>void;disabled?:boolean;readOnly?:boolean}){
 const generated=useId(),groupId=id??`radios-${generated}`,groupName=name??groupId;
 return <fieldset {...props} id={groupId} disabled={disabled} data-slot="radio-group" aria-readonly={readOnly||undefined}><legend>{label}</legend>{options.map((option,index)=>{const optionId=option.id??`${groupId}-${index}`;return <label key={option.value} htmlFor={optionId} data-slot="radio-option"><input data-slot="radio" id={optionId} type="radio" name={groupName} value={option.value} checked={value===option.value} disabled={option.disabled} aria-readonly={readOnly||undefined} onClick={e=>{if(readOnly)e.preventDefault();}} onKeyDown={e=>{if(readOnly&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown',' '].includes(e.key))e.preventDefault();}} onChange={e=>{if(!readOnly&&e.currentTarget.checked)onValueChange(option.value);}}/>{option.label}</label>;})}</fieldset>;
}
