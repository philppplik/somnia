import './panelI18n';
import {registerSheetsPanelCommands} from './panelController';
/**
 * Sheets studio command specs (engine-hardening plan, step 1.5).
 *
 * The workbook engine is a WASM worker owned by the SheetsCanvas Workbook component, so the
 * command layer reaches it through a small controller the component registers while mounted.
 * The specs expose the engine's operations as typed, level-checked commands mirrored into
 * the legacy registry, so palette, menus and (later) the toolRegistry/MCP bridge all read
 * the same entries.
 *
 * History: undo/redo live inside the WASM engine's own history (worker ops 'undo'/'redo'),
 * not the editor-core stack. Each spec declares that history in its run by calling the
 * controller, which delegates to the engine.
 *
 * All specs are `ui` level: they act on the open workbook immediately, so agent and MCP
 * origins are refused.
 */
import {registerCommandSpec} from '../commandBridge';
import type {CommandSpec} from '../commandSpec';

/** Bridge between the command specs and the Workbook component that owns the live engine. */
export interface SheetsCommandController {
  /** True while a workbook engine is open and not disposed. */
  ready():boolean;
  canUndo():boolean;
  canRedo():boolean;
  undo():void|Promise<void>;
  redo():void|Promise<void>;
  saveCopy():void|Promise<void>;
}

let activeController:SheetsCommandController|null=null;

/** Called by the Workbook component on mount; the returned disposer clears it on unmount. */
export function registerSheetsCommandController(controller:SheetsCommandController):()=>void {
  activeController=controller;
  return()=>{if(activeController===controller)activeController=null;};
}

export const getSheetsCommandController=()=>activeController;

/** What the specs need from the studio. Injected so the specs stay testable without a worker. */
export interface SheetsCommandDeps {
  controller():SheetsCommandController|null;
}

const expected=(message:string)=>{const e=new Error(message) as Error&{expected:boolean};e.expected=true;return e;};
const requireController=(deps:SheetsCommandDeps)=>{const c=deps.controller();if(!c||!c.ready())throw expected('No workbook is open in the Sheets studio.');return c;};

export function sheetsCommandSpecs(deps:SheetsCommandDeps):CommandSpec[] {
  return [
    {
      id:'sheets.undo',title:'Undo workbook change',category:'Edit',level:'ui',
      enabled:()=>deps.controller()?.canUndo()??false,
      // History: the WASM engine undo stack (worker op 'undo' in engine.ts).
      run:()=>requireController(deps).undo(),
    },
    {
      id:'sheets.redo',title:'Redo workbook change',category:'Edit',level:'ui',
      enabled:()=>deps.controller()?.canRedo()??false,
      // History: the WASM engine redo stack (worker op 'redo' in engine.ts).
      run:()=>requireController(deps).redo(),
    },
    {
      id:'sheets.saveCopy',title:'Save workbook copy',category:'Project',level:'ui',
      keywords:['xlsx','export','download','save'],
      enabled:()=>deps.controller()?.ready()??false,
      run:()=>requireController(deps).saveCopy(),
    },
  ];
}

const wiredSpecs=sheetsCommandSpecs({controller:getSheetsCommandController});

/**
 * Registers the sheets specs in the shared dispatcher and the legacy registry.
 * Returns one disposer that removes every registration. SheetsCanvas calls this on mount.
 */
export function registerSheetsCommands():()=>void {
  const offs=[...wiredSpecs.map(spec=>registerCommandSpec(spec)),registerSheetsPanelCommands()];
  return()=>{for(const off of offs)off();};
}
