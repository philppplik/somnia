import {registerSlidesPanelCommands} from './panelCommands';
/**
 * Slides studio command specs (engine-hardening plan, step 1.5).
 *
 * Until now the studio exposed its operations only through the command scope in
 * SlidesCanvas (overrides of the shared edit.undo/edit.redo/project.save). These specs make
 * the same operations first-class commands: typed, level-checked and activity-logged by the
 * shared dispatcher, and mirrored into the legacy registry so palette and menus pick them up
 * unchanged. SlidesCanvas registers them while it is mounted and routes its scope overrides
 * through them, so the spec is the single source of truth.
 *
 * History: the slides session keeps its own bounded undo/redo stacks of deck byte snapshots
 * in session.ts, not the editor-core history. Each mutating spec declares that history in
 * its run by going through slidesHistory; nothing here touches the global undo stack.
 *
 * All specs are `ui` level: they act on the open deck immediately, so agent and MCP origins
 * are refused. Reviewed agent edits keep using the deck_inspect/deck_propose_changes tools
 * until the toolRegistry bridge (plan step 1.6) reads these specs.
 */
import {registerCommandSpec,specToCommand} from '../commandBridge';
import type {Command} from '../commandRegistry';
import type {CommandSpec} from '../commandSpec';
import {getSlidesSessionState,saveSlidesCopy,showSlide,slidesHistory} from './session';

/** What the specs need from the studio. Injected so the specs stay testable without a worker. */
export interface SlidesCommandDeps {
  state(): {busy:boolean;working:boolean;canUndo:boolean;canRedo:boolean;slides:number;index:number};
  history(direction:'undo'|'redo'):void|Promise<void>;
  saveCopy():void|Promise<void>;
  showSlide(index:number):void|Promise<void>;
}

const expected=(message:string)=>{const e=new Error(message) as Error&{expected:boolean};e.expected=true;return e;};

export function slidesCommandSpecs(deps:SlidesCommandDeps):CommandSpec[] {
  return [
    {
      id:'slides.undo',title:'Undo slide text',category:'Edit',level:'ui',
      enabled:()=>{const s=deps.state();return s.working&&!s.busy&&s.canUndo;},
      // History: the slides session undo stack (bounded deck byte snapshots in session.ts).
      run:()=>deps.history('undo'),
    },
    {
      id:'slides.redo',title:'Redo slide text',category:'Edit',level:'ui',
      enabled:()=>{const s=deps.state();return s.working&&!s.busy&&s.canRedo;},
      // History: the slides session redo stack (bounded deck byte snapshots in session.ts).
      run:()=>deps.history('redo'),
    },
    {
      id:'slides.saveCopy',title:'Save presentation copy',category:'Project',level:'ui',
      enabled:()=>{const s=deps.state();return s.working&&!s.busy;},
      run:()=>deps.saveCopy(),
    },
    {
      id:'slides.showSlide',title:'Show slide',category:'View',level:'ui',
      keywords:['slide','page','go to','navigate'],
      params:{type:'object',properties:{index:{type:'integer',minimum:0,description:'Zero-based slide index.'}},required:['index'],additionalProperties:false},
      enabled:()=>{const s=deps.state();return s.slides>0&&!s.busy;},
      run:(params)=>{
        const index=(params as {index:number}).index;
        const s=deps.state();
        if(index>=s.slides)throw expected(`This presentation has ${s.slides} slide${s.slides===1?'':'s'}; slide index ${index} is out of range.`);
        return deps.showSlide(index);
      },
    },
  ];
}

/** Deps wired to the live slides session in session.ts (active deck; empty state when none). */
const sessionDeps:SlidesCommandDeps={
  state:()=>{const s=getSlidesSessionState();return {busy:s.busy,working:!!s.working,canUndo:s.undo.length>0,canRedo:s.redo.length>0,slides:s.summary?.slides??0,index:s.index};},
  history:direction=>slidesHistory(direction),
  saveCopy:()=>saveSlidesCopy(),
  showSlide:index=>showSlide(index),
};

const wiredSpecs=slidesCommandSpecs(sessionDeps);
const byId=new Map(wiredSpecs.map(spec=>[spec.id,spec]));

/**
 * Registers the slides specs in the shared dispatcher and the legacy registry.
 * Returns one disposer that removes every registration. SlidesCanvas calls this on mount.
 */
export function registerSlidesCommands():()=>void {
  const offs=[...wiredSpecs.map(spec=>registerCommandSpec(spec)),registerSlidesPanelCommands()];
  return()=>{for(const off of offs)off();};
}

/** Shared command ids the slides scope overrides, mapped to the spec that now owns the behaviour. */
const SCOPED_IDS:Readonly<Record<string,string>>={'edit.undo':'slides.undo','edit.redo':'slides.redo','project.save':'slides.saveCopy'};

/**
 * Legacy scope resolver for SlidesCanvas: routes the shared edit.undo/edit.redo/project.save
 * to the matching spec (dispatcher-validated and logged). Returns undefined for ids the
 * slides studio does not override, so other registrations keep working.
 */
export function slidesScopedCommand(id:string):Command|undefined {
  const specId=SCOPED_IDS[id];
  const spec=specId?byId.get(specId):undefined;
  return spec?specToCommand(spec):undefined;
}
