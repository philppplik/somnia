import {useT} from '../lib/useT';
import {useState} from 'react';
import {Button} from './ui/button';
import {componentFields,fieldKey} from '../lib/componentProps';
import type {ComponentField,FieldKind} from '../lib/componentProps';
import type {Component} from '../lib/componentSystem';
import {exposeField,changeInstanceField} from '../lib/componentActions';

type Run=(action:()=>void)=>void;
export function ComponentFieldBinding({enabled,run}:{enabled:boolean;run:Run}){
 const {t}=useT();
 const [name,setName]=useState(''),[kind,setKind]=useState<FieldKind>('text');
 return <details><summary>{t('panels.props.exposeAPropOrSlot')}</summary><p>{t('panels.props.selectATextElementLink')}</p>
 <label>{t('panels.props.fieldName')}<input aria-label={t('panels.props.exposedFieldName')} value={name} maxLength={60} onChange={e=>setName(e.target.value)}/></label>
 <label>{t('panels.props.fieldType')}<select aria-label={t('panels.props.exposedFieldType')} value={kind} onChange={e=>setKind(e.target.value as FieldKind)}><option value="text">{t('panels.props.text')}</option><option value="link">{t('panels.props.linkURL')}</option><option value="image">{t('panels.props.imageURL')}</option><option value="slot">{t('panels.props.slotHTML')}</option></select></label>
 <Button variant="outline" disabled={!enabled} onClick={()=>run(()=>exposeField(kind,name))}>{t('panels.props.exposeSelectedElement')}</Button></details>;
}
function FieldInput({field,component,run}:{field:ComponentField;component:Component;run:Run}){
 const {t}=useT();
 const [value,setValue]=useState(field.value);
 return <div className="space-y-2"><label>{field.name} ({t('panels.props.kind.'+field.kind)}){field.kind==='slot'?<textarea className="w-full min-h-24" aria-label={t('panels.props.instanceField',{kind:t('panels.props.kind.'+field.kind),name:field.name})} value={value} onChange={e=>setValue(e.target.value)}/>:<input className="w-full" aria-label={t('panels.props.instanceField',{kind:t('panels.props.kind.'+field.kind),name:field.name})} value={value} onChange={e=>setValue(e.target.value)}/>}</label>
 <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={()=>run(()=>changeInstanceField(component,field.kind,field.name,value))}>{t('panels.props.apply',{name:field.name})}</Button><Button variant="outline" onClick={()=>run(()=>changeInstanceField(component,field.kind,field.name,null))}>{t('panels.props.reset',{name:field.name})}</Button></div></div>;
}
export function ComponentInstanceFields({html,component,run}:{html:string;component:Component;run:Run}){
 const {t}=useT();
 let fields:ComponentField[];try{fields=componentFields(html);}catch(error){return <p role="alert">{t('panels.props.failed',{error:error instanceof Error?error.message:String(error)})}</p>;}
 return <div role="group" aria-label={t('panels.props.instancePropsAndSlots')} className="space-y-3"><h4>{t('panels.props.instancePropsAndSlots')}</h4>{fields.length?<><p>{t('panels.props.applyChangesToThisInstance')}</p>{fields.map(f=><FieldInput key={`${fieldKey(f)}:${f.value}`} field={f} component={component} run={run}/>)}</>:<p>No fields exposed. Add data-somnia-prop-text, data-somnia-prop-link, data-somnia-prop-image or data-somnia-slot to source elements, or use t('panels.props.exposeAPropOrSlot') before saving a variant.</p>}</div>;
}
