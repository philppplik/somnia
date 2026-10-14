import {NumberField} from '../ui/number-field';
import {useT} from '../../lib/useT';
/** New-studio adapter only. Domain/session validation remains with the command. */
export function InspectorNumberField({label,value,onCommit,step=1,min,max,disabled,resetKey,format=String,className}:{label:string;value:number;onCommit:(value:number)=>void;step?:number;min?:number;max?:number;disabled?:boolean;resetKey?:string|number;format?:(value:number)=>string;className?:string}){
 const {t}=useT();const error=t('schemaForm.invalid',{name:label});
 return <NumberField label={label} aria-label={label} className={className} value={value} disabled={disabled} resetKey={resetKey} step={step} min={min} max={max} format={format} constraintError={error}
  parse={draft=>draft.trim()!==''&&Number.isFinite(Number(draft))?{ok:true,value:Number(draft)}:{ok:false,error}}
  onCommit={next=>{if(next!==value)onCommit(next);}}/>;
}
