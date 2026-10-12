/** Studio shell v2 data model (concept section 5). Purely additive: nothing here is wired into the UI yet (M0). */
export type MenuId='Project'|'Edit'|'View'|'Insert'|'Tools'|'Help';
export const MENU_IDS:readonly MenuId[]=['Project','Edit','View','Insert','Tools','Help'];

export interface MenuItemDef{
 menu:MenuId;
 command:string;           // command id
 group:string;             // e.g. 'file.save'
 order:number;             // within group
 when?:string;
 labelOverride?:string;    // i18n key
 submenu?:readonly MenuItemDef[];
 hideBase?:boolean;        // hide a global base item with the same command in this studio
}
export interface RailItemDef{
 id:string;icon:string;label:string;
 kind:'panel'|'action';
 command?:string;panel?:string;when?:string;badge?:string;
 order:number;
 defaultPinned?:boolean;   // default true
 movable?:boolean;         // may move between left and right, default false
}
export interface PanelDef{id:string;title:string;component:string;side:'left'|'right';defaultOpen?:boolean;minHeight?:number;tool?:string;}
export interface ToolDef{id:string;command:string;icon:string;group?:string;opensPanel?:string;optionsBar?:string;cursor?:string;shortcut?:string;}
export interface StatusSlotDef{id:string;align:'left'|'center'|'right';component:string;when?:string;command?:string;}
export interface StudioLayout{leftOpen:boolean;rightOpen:boolean;leftWidth:number;rightWidth:number;leftPanels:string[];rightPanels:string[];activeLeft?:string;activeRight?:string;}
/** `unpinned` is an addition to the concept sketch: it lets a default-pinned item be moved to overflow explicitly. */
export interface RailOverrides{order:string[];pinned:string[];hidden:string[];unpinned?:string[];}
export interface ShellLayoutEntry extends StudioLayout{railOverrides:RailOverrides;}
export type ShellLayout=Record<string,ShellLayoutEntry>;

/** v2 additions to a studio manifest. All optional so old manifests compile unchanged. */
export interface StudioShellDef{
 menus?:readonly MenuItemDef[];
 leftRail?:readonly RailItemDef[];
 rightRail?:readonly RailItemDef[];
 panels?:readonly PanelDef[];
 tools?:readonly ToolDef[];
 statusSlots?:readonly StatusSlotDef[];
 problems?:string;
 defaultLayout?:StudioLayout;
}
export interface StudioAgentDefV2{tools:readonly string[];contextProviders:readonly string[];quickActions:readonly string[];context?:string;}
export type CommandRisk='none'|'content'|'destructive'|'outbound';
export type JsonSchema={[k:string]:unknown};

/** Context published by the active canvas and merged by the shell. Feeds `when` and the AI. */
export interface StudioContext{
 studio:string;
 document?:{id:string;kind:string;dirty:boolean;readOnly:boolean};
 mode?:string;
 selection:{kind:'none'|'one'|'many';type?:string;count:number};
 activeTool?:string;
 busy:boolean;
 services:Record<string,boolean>;
}
export const EMPTY_STUDIO_CONTEXT:StudioContext=Object.freeze({studio:'',selection:Object.freeze({kind:'none' as const,count:0}),busy:false,services:Object.freeze({})});
