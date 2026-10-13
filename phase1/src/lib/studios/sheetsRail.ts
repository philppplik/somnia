/**
 * Sheets studio rail and shell wiring (studio shell v2, concept docs/concepts/studio-shell.md
 * sections 4.3 and 9.4; Documents is the reference migration).
 *
 * Pure data: rail item defs, the studio-agnostic global panels, the default customization state
 * (pin/overflow/order) and the assembled `shellV2` fragment the Sheets manifest wires in.
 * Panel and inspector data come from `../sheets/panels` (panels task); hosts are registered from
 * the component layer (components/sheets/registerShell.ts). This module never imports components.
 *
 * Rail layout decisions (Sheets):
 *  - Left: workbook structure first, then the studio-agnostic Files/Search, then Analysis.
 *    Versions starts in the overflow ("more") menu: useful, but not an everyday icon, so the main
 *    rail stays lean. Users pin it back via the rail customization (context menu or drag and drop).
 *  - Right: the generic inspector (cell + formulas sections), a Formulas quick panel and an
 *    Export button that runs the real `sheets.saveCopy` command. With no workbook open the command
 *    answers with its expected, user-visible notice. No formatting actions: the engine writes
 *    values and formulas only.
 */
import type {PanelDef,RailItemDef,StudioLayout,StudioShellDef} from '../shell/types';
import {registerRailIcons} from '../shell/railIcons';
import {Download} from '../icons';
import {sheetsPanelDefs,sheetsInspectorDef} from '../sheets/panels';

/**
 * Sheets-specific addition to the shared rail glyph set (components/shell/railIconSet.ts registers
 * the rest: Table2, Lightbulb, Files, Search, VersionsIcon, SlidersHorizontal, CodeXml).
 * Registration is first-wins and global: the same name keeps the same glyph in every studio.
 */
export const SHEETS_RAIL_ICONS={Download} as const;
registerRailIcons(SHEETS_RAIL_ICONS);

/**
 * Studio-agnostic side panels (Files/Search/Versions). Their hosts (`code.*`) are registered
 * already; the defs are re-declared per studio because a shellV2 manifest is self-contained
 * (the validator requires every rail panel to exist in the same manifest, on the same side).
 * Same pattern as the Documents reference.
 */
export const SHEETS_GLOBAL_PANELS:readonly PanelDef[]=[
 {id:'files',title:'Files',component:'code.files',side:'left',icon:'Files'},
 {id:'search',title:'Search',component:'code.search',side:'left',icon:'Search'},
 {id:'versions',title:'Versions',component:'code.versions',side:'left',icon:'VersionsIcon'},
];

export const SHEETS_LEFT_RAIL:readonly RailItemDef[]=[
 {id:'workbook',icon:'Table2',label:'Workbook',labelKey:'sheets.rail.workbook',kind:'panel',panel:'workbook',order:10},
 {id:'files',icon:'Files',label:'Files',kind:'panel',panel:'files',order:20},
 {id:'search',icon:'Search',label:'Search',kind:'panel',panel:'search',order:30},
 {id:'analysis',icon:'Lightbulb',label:'Analysis',labelKey:'sheets.rail.analysis',kind:'panel',panel:'analysis',order:40},
 {id:'versions',icon:'VersionsIcon',label:'Versions',kind:'panel',panel:'versions',order:50,defaultPinned:false},
];
export const SHEETS_RIGHT_RAIL:readonly RailItemDef[]=[
 {id:'inspector',icon:'SlidersHorizontal',label:'Inspector',labelKey:'sheets.rail.inspector',kind:'panel',panel:'inspector',order:10},
 {id:'formulas',icon:'CodeXml',label:'Formulas',labelKey:'sheets.rail.formulas',kind:'panel',panel:'formulas',order:20},
 {id:'export',icon:'Download',label:'Export copy',labelKey:'sheets.exportCopy',kind:'command',command:'sheets.saveCopy',order:30,movable:true},
];

/** First-open layout: workbook navigation left, inspector right; the canvas keeps the room. */
export const SHEETS_LAYOUT:StudioLayout={
 leftOpen:true,rightOpen:true,leftWidth:260,rightWidth:320,
 leftPanels:['workbook'],rightPanels:['inspector'],activeLeft:'workbook',activeRight:'inspector',
};

/** The Sheets `shellV2` fragment: global panels + the panel defs from the panels task + this rail. */
export const sheetsShellV2:StudioShellDef={
 panels:[...SHEETS_GLOBAL_PANELS,...sheetsPanelDefs],
 leftRail:SHEETS_LEFT_RAIL,
 rightRail:SHEETS_RIGHT_RAIL,
 inspector:sheetsInspectorDef,
 defaultLayout:SHEETS_LAYOUT,
};
