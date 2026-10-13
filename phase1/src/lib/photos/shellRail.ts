import type {RailItemDef,StudioLayout} from '../shell/types';
import {registerRailIcons} from '../shell/railIcons';
import {PHOTOS_RAIL_ICON_MAP} from './railIcons';
/**
 * Photos studio rails for the studio shell (concept docs/concepts/studio-shell.md, sections 3.4 and 9.4).
 * Data only: the items point at panel ids declared in `shellV2.panels` (see PHOTOS_PANEL_IDS, the contract between
 * the rail and the panel definitions) and at icon names in the rail icon registry. Nothing here knows how a panel renders.
 *
 * Left rail: History (undo stack of the current photo) and Info (file facts, off the rail by default).
 * Right rail: the develop sections in the order of the develop pipeline: Light, Color, Effects, Detail, Transform.
 * Global items (Files, Search, Extensions, Settings, Chat, Agent) are added by the shell, not declared here.
 */
export const PHOTOS_PANEL_IDS={left:['history','info'],right:['light','color','effects','detail','transform']} as const;
export type PhotosLeftPanelId=typeof PHOTOS_PANEL_IDS.left[number];
export type PhotosRightPanelId=typeof PHOTOS_PANEL_IDS.right[number];
/** i18n keys (catalogue src/locales/photos/rail.*.json) for the rail tooltips; `label` stays the English fallback. */
export const PHOTOS_RAIL_LABEL_KEYS:Record<PhotosLeftPanelId|PhotosRightPanelId,string>={
 history:'photos.rail.history',info:'photos.rail.info',light:'photos.rail.light',color:'photos.rail.color',
 effects:'photos.rail.effects',detail:'photos.rail.detail',transform:'photos.rail.transform',
};
const item=(id:PhotosLeftPanelId|PhotosRightPanelId,icon:string,label:string,order:number,extra:Partial<RailItemDef>={}):RailItemDef=>
 ({id,icon,label,kind:'panel',panel:id,order,...extra});
export const PHOTOS_LEFT_RAIL:readonly RailItemDef[]=[
 item('history','History','History',10),
 item('info','Info','Info',20,{defaultPinned:false}),
];
export const PHOTOS_RIGHT_RAIL:readonly RailItemDef[]=[
 item('light','DevelopLight','Light',10),
 item('color','DevelopColor','Color',20),
 item('effects','DevelopEffects','Effects',30),
 item('detail','DevelopDetail','Detail',40),
 item('transform','DevelopTransform','Transform',50),
];
/**
 * First-open layout: the canvas gets the room. Left side closed, right side open on Light.
 * Rail overrides (order, pin, hide) start empty; the only non-default pin state is `defaultPinned:false` on Info.
 */
export const PHOTOS_DEFAULT_LAYOUT:StudioLayout={leftOpen:false,rightOpen:true,leftWidth:260,rightWidth:320,leftPanels:[],rightPanels:['light'],activeRight:'light'};
/** Localised tooltip text for a rail item: catalogue entry when present, English label otherwise. */
export function photosRailLabel(it:Pick<RailItemDef,'id'|'label'>,t:(key:string)=>string):string{
 const key=(PHOTOS_RAIL_LABEL_KEYS as Record<string,string|undefined>)[it.id];
 if(!key)return it.label;
 const v=t(key);return v&&v!==key?v:it.label;
}
let registered=false;
/** Idempotent. First-wins registry, so calling twice or after another studio is harmless. */
export function registerPhotosRailIcons(){if(registered)return;registered=true;registerRailIcons(PHOTOS_RAIL_ICON_MAP);}
registerPhotosRailIcons();
