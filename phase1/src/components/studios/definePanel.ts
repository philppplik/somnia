import type {PanelDef} from '../../lib/shell/types';
import {registerPanelHost,type PanelComponent} from './hosts';
/**
 * Studio-author entry point: declare a panel and its `render` in one place.
 * The host is registered under `<studio>.<id>` (duplicates throw, like registerPanelHost) and the returned PanelDef
 * goes into `shellV2.panels`. `render` receives `{panelId,context}`; it must render a self-contained region.
 */
export type PanelSpec=Omit<PanelDef,'component'>&{render:PanelComponent};
export function definePanel(studio:string,spec:PanelSpec):PanelDef{
 const {render,...def}=spec;const component=`${studio}.${def.id}`;
 registerPanelHost(component,render);
 return {...def,component,persistKey:def.persistKey??component};
}
