import {useState} from 'react';
import {Button} from './ui/button';
import {componentFields,fieldKey} from '../lib/componentProps';
import type {ComponentField,FieldKind} from '../lib/componentProps';
import type {Component} from '../lib/componentSystem';
import {exposeField,changeInstanceField} from '../lib/componentActions';

type Run=(action:()=>void)=>void;
export function ComponentFieldBinding({enabled,run}:{enabled:boolean;run:Run}){
 const [name,setName]=useState(''),[kind,setKind]=useState<FieldKind>('text');
 return <details><summary>Expose a prop or slot</summary><p>Select a text element, link, image or content container. Use the same field name in each variant.</p>
 <label>Field name<input aria-label="Exposed field name" value={name} maxLength={60} onChange={e=>setName(e.target.value)}/></label>
 <label>Field type<select aria-label="Exposed field type" value={kind} onChange={e=>setKind(e.target.value as FieldKind)}><option value="text">Text</option><option value="link">Link URL</option><option value="image">Image URL</option><option value="slot">Slot (HTML)</option></select></label>
 <Button variant="outline" disabled={!enabled} onClick={()=>run(()=>exposeField(kind,name))}>Expose selected element</Button></details>;
}
function FieldInput({field,component,run}:{field:ComponentField;component:Component;run:Run}){
 const [value,setValue]=useState(field.value);
 return <div className="space-y-2"><label>{field.name} ({field.kind}){field.kind==='slot'?<textarea className="w-full min-h-24" aria-label={`Instance ${field.kind} ${field.name}`} value={value} onChange={e=>setValue(e.target.value)}/>:<input className="w-full" aria-label={`Instance ${field.kind} ${field.name}`} value={value} onChange={e=>setValue(e.target.value)}/>}</label>
 <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={()=>run(()=>changeInstanceField(component,field.kind,field.name,value))}>Apply {field.name}</Button><Button variant="outline" onClick={()=>run(()=>changeInstanceField(component,field.kind,field.name,null))}>Reset {field.name}</Button></div></div>;
}
export function ComponentInstanceFields({html,component,run}:{html:string;component:Component;run:Run}){
 let fields:ComponentField[];try{fields=componentFields(html);}catch(error){return <p role="alert">Cannot edit instance fields: {error instanceof Error?error.message:String(error)}</p>;}
 return <div role="group" aria-label="Instance props and slots" className="space-y-3"><h4>Instance props and slots</h4>{fields.length?<><p>Apply changes to this instance only. Named fields survive variant changes. Slots accept HTML, just like the code editor.</p>{fields.map(f=><FieldInput key={`${fieldKey(f)}:${f.value}`} field={f} component={component} run={run}/>)}</>:<p>No fields exposed. Add data-somnia-prop-text, data-somnia-prop-link, data-somnia-prop-image or data-somnia-slot to source elements, or use "Expose a prop or slot" before saving a variant.</p>}</div>;
}
