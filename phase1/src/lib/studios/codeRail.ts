import type {RailItemDef,StudioLayout} from '../shell/types';
import {registerRailIcons} from '../shell/railIcons';
import {CODE_RAIL_ICON_MAP} from './codeRailIcons';
import {DEPLOY_RAIL_ITEMS} from '../deployPanels/shell';
import '../deployPanels/icons';
/**
 * Code studio rails and first-open layout for the studio shell (concept docs/concepts/studio-shell.md,
 * sections 3.4-3.6 and 9.4). Data only: items point at the panel ids declared by `codePanels`
 * (lib/codePanels/shell.ts, owned by the panel wave) and at names in the shared rail icon registry.
 * Nothing here knows how a panel renders.
 *
 * Left rail keeps the legacy Code order (Layers, Files, Search, Components, CSS, Versions) and appends
 * the two new panels (Responsive, Outline): the migration should not shuffle icons users know.
 * The right rail is the single generic inspector (its sections are declared in codeInspector).
 * Global items (Extensions, Settings, Chat, Agent) are added by the shell, not declared here.
 *
 * Customization defaults: every item is pinned (nothing in the overflow "More" group), the declared
 * order is the default order, and the user's reorder/pin/hide edits live as railOverrides in the shell
 * layout store (store/railActions.ts). No item carries a `when` yet: the Code canvas does not publish a
 * StudioContext, so a context expression would hide the item everywhere (missing paths are falsy).
 */
const item=(id:string,icon:string,order:number):RailItemDef=>
 ({id,icon,label:id==='css'?'CSS':id==='inspector'?'Design':id[0].toUpperCase()+id.slice(1),labelKey:`code.rail.${id}`,kind:'panel',panel:id,order});
export const CODE_LEFT_RAIL:readonly RailItemDef[]=[
 item('layers','Layers',10),
 item('files','Files',20),
 item('search','Search',30),
 item('components','Boxes',40),
 item('css','Paintbrush',50),
 item('versions','VersionsIcon',60),
 item('responsive','MonitorSmartphone',70),
 item('outline','Hash',80),
 ...DEPLOY_RAIL_ITEMS,
];
export const CODE_RIGHT_RAIL:readonly RailItemDef[]=[
 item('inspector','SlidersHorizontal',10),
];
/**
 * First-open layout, mirroring the pre-shell Code studio: Layers open on the left, the inspector
 * (was: Design tab) open on the right. Rail overrides start empty (all pinned, declared order).
 */
export const CODE_SHELL_LAYOUT:StudioLayout={leftOpen:true,rightOpen:true,leftWidth:260,rightWidth:320,leftPanels:['layers'],rightPanels:['inspector'],activeLeft:'layers',activeRight:'inspector'};
let registered=false;
/** Idempotent. The registry is first-wins, so calling twice or after another studio is harmless. */
export function registerCodeRailIcons(){if(registered)return;registered=true;registerRailIcons(CODE_RAIL_ICON_MAP);}
registerCodeRailIcons();
