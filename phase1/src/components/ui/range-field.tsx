import {useEffect,useRef} from 'react';
import type {ComponentProps} from 'react';
import {Field} from './field';
import type {FieldProps} from './field';
export interface RangeFieldProps extends Omit<ComponentProps<'input'>,'type'|'value'|'defaultValue'|'onChange'|'children'> {
 label:FieldProps['label'];hint?:FieldProps['hint'];value:number;readout?:string;unit?:string;
 onBegin?:()=>void;onPreview:(value:number)=>void;onCommit:(value:number)=>void;onCancel:(original:number)=>void;
}
const rangeKeys=new Set(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','PageUp','PageDown']);
/** One caller-owned gesture, no engine/store assumptions. Cancel never commits. */
export function RangeField({label,hint,value,readout,unit,onBegin,onPreview,onCommit,onCancel,id,disabled,readOnly,
 onPointerDown,onPointerUp,onPointerCancel,onLostPointerCapture,onKeyDown,onKeyUp,onBlur,...input}:RangeFieldProps){
 const gesture=useRef<{original:number;latest:number;kind:'pointer'|'keyboard'|'change'}|null>(null);
 const callbacks=useRef({onCancel});callbacks.current={onCancel};
 const begin=(kind:'pointer'|'keyboard'|'change')=>{if(disabled||readOnly||gesture.current)return;gesture.current={original:value,latest:value,kind};onBegin?.();};
 const finish=(cancel=false)=>{const current=gesture.current;if(!current)return;gesture.current=null;if(cancel)onCancel(current.original);else if(!disabled&&!readOnly)onCommit(current.latest);else onCancel(current.original);};
 useEffect(()=>{if((disabled||readOnly)&&gesture.current){const g=gesture.current;gesture.current=null;callbacks.current.onCancel(g.original);}},[disabled,readOnly]);
 useEffect(()=>()=>{if(gesture.current)callbacks.current.onCancel(gesture.current.original);},[]);
 return <Field label={label} controlId={id} hint={hint}>{control=><span data-slot="range-row" className="ds-range-row">
  <input {...input} {...control} aria-describedby={[input['aria-describedby'],control['aria-describedby']].filter(Boolean).join(' ')||undefined} data-slot="range-field" type="range" value={value} disabled={disabled} readOnly={readOnly}
   aria-valuetext={readout===undefined?undefined:`${readout}${unit?` ${unit}`:''}`}
   onPointerDown={e=>{onPointerDown?.(e);if(e.defaultPrevented||disabled||readOnly)return;begin('pointer');e.currentTarget.setPointerCapture?.(e.pointerId);}}
   onChange={e=>{if(disabled||readOnly)return;begin('change');const next=Number(e.currentTarget.value);if(!Number.isFinite(next))return;if(gesture.current)gesture.current.latest=next;onPreview(next);}}
   onPointerUp={e=>{onPointerUp?.(e);finish();}}
   onPointerCancel={e=>{onPointerCancel?.(e);finish(true);}}
   onLostPointerCapture={e=>{onLostPointerCapture?.(e);finish(true);}}
   onKeyDown={e=>{onKeyDown?.(e);if(e.defaultPrevented)return;if(e.key==='Escape'){e.preventDefault();finish(true);}else if(rangeKeys.has(e.key)){if(readOnly)e.preventDefault();else begin('keyboard');}}}
   onKeyUp={e=>{onKeyUp?.(e);if(rangeKeys.has(e.key))finish();}}
   onBlur={e=>{onBlur?.(e);finish();}}/>
  <output data-slot="range-readout" htmlFor={control.id} className="ds-value-readout">{readout??value}{unit?` ${unit}`:''}</output>
 </span>}</Field>;
}
