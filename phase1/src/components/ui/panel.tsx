import type {ComponentProps,ReactNode} from 'react';
import {cn} from '../../lib/cn';
/** Presentational only; shell adapters still own registry and persisted collapse state. */
export function PanelBody({className,...props}:ComponentProps<'div'>){return <div data-slot="panel-body" className={cn('ds-panel-body',className)} {...props}/>;}
export function PanelHeader({className,...props}:ComponentProps<'div'>){return <div data-slot="panel-header" className={cn('ds-panel-header',className)} {...props}/>;}
export function PanelSection({title,open,onOpenChange,children,id,...props}:Omit<ComponentProps<'section'>,'title'> & {title:ReactNode;open:boolean;onOpenChange:(open:boolean)=>void;id:string}){
 return <section {...props} data-slot="panel-section"><button type="button" data-slot="panel-section-trigger" className="ds-panel-section-trigger" aria-expanded={open} aria-controls={id} onClick={()=>onOpenChange(!open)}><span aria-hidden="true">{open?'▾':'▸'}</span>{title}</button>{open&&<PanelBody id={id}>{children}</PanelBody>}</section>;
}
export interface PropertyRow {id:string;label:ReactNode;value:ReactNode}
export function PropertyList({rows,className,...props}:ComponentProps<'dl'>&{rows:readonly PropertyRow[]}){return <dl data-slot="property-list" className={cn('ds-property-list',className)} {...props}>{rows.map(row=><div key={row.id} className="ds-property-row"><dt>{row.label}</dt><dd>{row.value}</dd></div>)}</dl>;}
