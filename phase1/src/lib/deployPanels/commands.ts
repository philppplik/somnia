import {registerCommandSpec} from '../commandBridge';
import type {CommandContext,CommandOrigin,CommandSpec} from '../commandSpec';
import {CommandDispatchError} from '../commandDispatcher';
/**
 * Typed UI commands of the Publish panels. They only move UI state or ask for a plan; nothing here uploads.
 * `ui` level: agent and MCP origins are refused by the dispatcher, and each handler re-checks the origin, so a
 * script cannot pick a target or change a domain either. Publishing itself stays `deploy.publish` with its dialog.
 * Adapters are injected by components/deploy/registerDeployShell.ts, so this module imports no store or component.
 */
export type DeployPanelId='publish'|'publish-log';
export interface DeployPanelActions{
 available:()=>boolean;
 show:(panel:DeployPanelId)=>void;
 select:(targetId:string)=>boolean;
 dryRun:(targetId?:string)=>Promise<{files:number;changed:number;added:number;removed:number}|null>;
 setDomain:(targetId:string,domain:string)=>Promise<boolean>;
}
const HUMAN:readonly CommandOrigin[]=['ui','palette','menu','shortcut','test'];
const ID='^[a-z0-9-]{1,40}$';
const human=(ctx:CommandContext,id:string)=>{if(!HUMAN.includes(ctx.origin))throw new CommandDispatchError('forbidden-origin',`Command ${id} needs a person: origin "${ctx.origin}" cannot run it.`);};
export function deployPanelSpecs(a:DeployPanelActions):readonly CommandSpec<any,unknown>[]{
 const common={category:'Project' as const,level:'ui' as const,enabled:a.available};
 return [
  {...common,id:'deploy.panel.show',title:'Show publish panel',keywords:['publish','deploy','server'],
   params:{type:'object',properties:{panel:{type:'string',enum:['publish','publish-log']}},required:['panel'],additionalProperties:false},
   run:({panel}:{panel:DeployPanelId},ctx:CommandContext)=>{human(ctx,'deploy.panel.show');a.show(panel);return {status:'shown'};}},
  {...common,id:'deploy.target.select',title:'Select publish target',
   params:{type:'object',properties:{targetId:{type:'string',pattern:ID}},required:['targetId'],additionalProperties:false},
   run:({targetId}:{targetId:string},ctx:CommandContext)=>{human(ctx,'deploy.target.select');return {selected:a.select(targetId)};}},
  {...common,id:'deploy.dryrun',title:'Preview publish changes',keywords:['dry run','diff','preview','what changes'],
   params:{type:'object',properties:{targetId:{type:'string',pattern:ID}},additionalProperties:false},
   run:async({targetId}:{targetId?:string},ctx:CommandContext)=>{human(ctx,'deploy.dryrun');const r=await a.dryRun(targetId);return r?{status:'planned',...r}:{status:'failed'};}},
  {...common,id:'deploy.target.setDomain',title:'Set publish domain',
   params:{type:'object',properties:{targetId:{type:'string',pattern:ID},domain:{type:'string',maxLength:253}},required:['targetId','domain'],additionalProperties:false},
   run:async({targetId,domain}:{targetId:string;domain:string},ctx:CommandContext)=>{human(ctx,'deploy.target.setDomain');return {saved:await a.setDomain(targetId,domain)};}},
 ];
}
export function registerDeployPanelCommands(a:DeployPanelActions){const offs=deployPanelSpecs(a).map(s=>registerCommandSpec(s as CommandSpec<any,void>));return()=>offs.reverse().forEach(off=>off());}
