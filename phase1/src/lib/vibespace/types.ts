import type {ModelRef,RunSnapshot,SnapshotReply,StudioSummary,SpaceSummary} from './wire';
export type * from './wire';
export const studioStates=['draft','running','paused','needs-you','ready','done','stopped','applied','discarded','failed','crashed'] as const;
export type StudioState=typeof studioStates[number];
export interface FolderGrant {folderGrantId:string;folder:string}
export type Space=SpaceSummary;
export type Studio=RunSnapshot & {sequence:number};
/** Injected read binding assembles this presentation collection, not a native DTO. */
export interface VibeSnapshot {revision:number;spaces:Space[];sessions:StudioSummary[];studios:Studio[];models:ModelRef[]}
export interface VibeReadProjection {revision:number;spaces:Space[];sessions:StudioSummary[];runs:SnapshotReply[];models:ModelRef[]}
interface CommandBase {commandId:string;expectedRevision:number}
export type VibeCommand=CommandBase & (
 |{type:'create-space';name:string;folderGrantId:string}
 |{type:'create-studio';spaceId:string;goal:string;model:ModelRef}
 |{type:'stop';runId:string}
 |{type:'start';studioId:string}
 |{type:'steer';runId:string;message:string}
 |{type:'consent';runId:string;requestId:string;choice:'allow_once'|'allow_for_run'|'deny'}
 |{type:'review';runId:string;reviewRevision:string;decision:'apply'|'discard';paths:string[]}
 |{type:'restore';runId:string;checkpointId:string}
 |{type:'retry';runId:string}
);
export type VibeIntent=VibeCommand extends infer C ? C extends CommandBase ? Omit<C,keyof CommandBase> : never : never;
export interface VibeSpaceTransport {
 readonly mode:'native'|'fixture';readonly capabilities:readonly VibeIntent['type'][];
 snapshot():Promise<VibeSnapshot>;chooseFolder():Promise<FolderGrant|null>;
 subscribe(onEvent:(event:import('./wire').VibeEvent)=>void,onError:(error:unknown)=>void):Promise<()=>void>;
 execute(command:VibeCommand):Promise<VibeSnapshot>;
}
