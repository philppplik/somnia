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
 id:string;
 /** Icon name resolved through the rail icon registry (lib/shell/railIcons.ts). Unknown names fall back, never throw. */
 icon:string;label:string;
 /** i18n key for `label` (tooltip and aria-label). Wins over `label`, which stays the fallback text. */
 labelKey?:string;
 /** `panel` opens/toggles `panel`; `tool` activates ToolDef `tool` and opens its `opensPanel`; `command` runs `command` (a rail button, no panel). `action` is the pre-v2 spelling of `command`. */
 kind:'panel'|'tool'|'command'|'action';
 command?:string;panel?:string;tool?:string;when?:string;badge?:string;
 order:number;
 defaultPinned?:boolean;   // default true
 movable?:boolean;         // may move between left and right, default false
}
/**
 * A panel is data plus a host. `component` names a host registered with `registerPanelHost` (an explicit allowlist,
 * a manifest never supplies a module path). `definePanel` (components/studios/definePanel.ts) registers the host and
 * returns this record, which is the intended way for a studio author to write `render`.
 * Placement: `rail` panels are opened/closed by the user from a rail item. `docked` panels need no rail item: they join
 * the end of the side stack while `when` holds (e.g. selection properties) and leave when it stops holding.
 */
export type PanelPlacement='rail'|'docked';
export interface PanelDef{
 id:string;title:string;component:string;side:'left'|'right';
 /** i18n key for `title`. When absent `title` is shown as is (existing Code panels). */
 titleKey?:string;
 icon?:string;placement?:PanelPlacement;
 /** Availability expression over StudioContext (when.ts). Unavailable panels are not rendered and not reachable. Default: always. */
 when?:string;
 /** Command ids this panel owns or triggers. Validated against the command registry by check:ui-commands and the shell validator. */
 commands?:readonly string[];
 /** Key for panel-local persisted UI state (usePanelState). Default: `<studio>.<id>`. */
 persistKey?:string;
 defaultOpen?:boolean;minHeight?:number;tool?:string;
}
/** Props every panel host receives. `context` is the merged StudioContext of the active studio (selection, mode, services). */
export interface PanelHostProps{panelId:string;context:StudioContext;}
/** One section of a studio inspector. `component` names a section host registered with registerInspectorSection. */
export interface InspectorSectionDef{
 id:string;title:string;titleKey?:string;component:string;
 /** Expression over StudioContext, e.g. "selection.kind == 'one'". Default: always. */
 when?:string;
 /** Lower first. Ties keep declaration order. */
 order?:number;
 commands?:readonly string[];
 defaultCollapsed?:boolean;
}
export interface InspectorDef{titleKey?:string;/** i18n key shown when no section applies */emptyKey?:string;sections:readonly InspectorSectionDef[]}
/** Section hosts receive the merged StudioContext. */
export interface InspectorSectionProps{sectionId:string;context:StudioContext}
export const INSPECTOR_HOST='shell.inspector';
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
 /** Studio-agnostic inspector: sections shown by the generic `shell.inspector` panel host while their `when` holds. */
 inspector?:InspectorDef;
 tools?:readonly ToolDef[];
 statusSlots?:readonly StatusSlotDef[];
 problems?:string;
 defaultLayout?:StudioLayout;
}
/**
 * Header hero action: the one primary verb a studio shows in the header slot where Publish sits.
 * Data only. The shell calls `executeCommand(id)` and never asks which studio is active. See docs/concepts/hero-action-shell-contract.md.
 */
export interface HeroActionDef{
 /** Command id; must exist in the command registry, otherwise the slot falls back to Publish. */
 id:string;
 /** i18n key of the label (all five locales). The label is also the accessible name. */
 labelKey:string;
 /** Rail icon name (shell/railIcons). Unknown names get the fallback glyph. */
 icon:string;
 /** Command ids for the split-button chevron, in order. `deploy.open` is always appended as the last entry. */
 menu?:readonly string[];
 /** `when` expression over StudioContext. While it does not hold, the slot shows the default Publish button. */
 when?:string;
 /** Optional toggle state: `when`-style expression over the slot context. While set, the main button renders `aria-pressed`. */
 pressedWhen?:string;
 /** i18n key for the tooltip while `pressedWhen` holds (e.g. "Close live preview"). The label itself stays stable. */
 pressedTooltipKey?:string;
}
export interface StudioAgentDefV2{tools:readonly string[];contextProviders:readonly string[];quickActions:readonly string[];context?:string;}
export type CommandRisk='none'|'content'|'destructive'|'outbound';
export type JsonSchema={[k:string]:unknown};

/** Context published by the active canvas and merged by the shell. Feeds `when` and the AI. */
export interface StudioContext{
 studio:string;
 document?:{id:string;kind:string;dirty:boolean;readOnly:boolean};
 mode?:string;
 selection:{kind:'none'|'one'|'many';type?:string;count:number;/** stable ids of the selected items, studio-defined */ids?:readonly string[]};
 /** Studio-specific, JSON-serialisable details a panel needs (e.g. `{paragraph:3,styleId:'Heading1'}`). Keep it small: it is diffed on every report. */
 data?:Record<string,unknown>;
 activeTool?:string;
 busy:boolean;
 services:Record<string,boolean>;
}
export const EMPTY_STUDIO_CONTEXT:StudioContext=Object.freeze({studio:'',selection:Object.freeze({kind:'none' as const,count:0}),busy:false,services:Object.freeze({})});
