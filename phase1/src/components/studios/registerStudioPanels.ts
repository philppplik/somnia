import type {StudioDef} from '../../lib/studios/registry';
import {hasPanelHost,registerPanelHost,type PanelComponent} from './hosts';
import {registerInspectorSection} from '../shell/InspectorPanel';
import type {ComponentType} from 'react';
import type {InspectorSectionProps} from '../../lib/shell/types';
/**
 * Components-layer half of a migrated studio: registers the hosts its manifest (lib/studios/<id>.ts, pure data)
 * names. `panels` is keyed by PanelDef.component, `sections` by InspectorSectionDef.component. Throws when the
 * manifest names a host that is not supplied here (unless already registered, e.g. shared code hosts) or when a
 * supplied host is not named, so manifest and hosts cannot drift. Returns a dispose function.
 */
export function registerStudioPanels(studio:Pick<StudioDef,'id'|'shellV2'>,hosts:{panels?:Record<string,PanelComponent>;sections?:Record<string,ComponentType<InspectorSectionProps>>}):()=>void{
 const panels=hosts.panels??{},sections=hosts.sections??{};
 const named=new Set((studio.shellV2?.panels??[]).map(p=>p.component)),namedSections=new Set((studio.shellV2?.inspector?.sections??[]).map(s=>s.component));
 for(const c of Object.keys(panels))if(!named.has(c))throw new Error(`${studio.id}: host "${c}" is not used by any panel`);
 for(const c of Object.keys(sections))if(!namedSections.has(c))throw new Error(`${studio.id}: section host "${c}" is not used by any inspector section`);
 for(const c of named)if(!(c in panels)&&!hasPanelHost(c))throw new Error(`${studio.id}: panel host "${c}" is missing`);
 const offs=[...Object.entries(panels).map(([c,h])=>registerPanelHost(c,h)),...Object.entries(sections).map(([c,h])=>registerInspectorSection(c,h))];
 return()=>offs.forEach(f=>f());
}
