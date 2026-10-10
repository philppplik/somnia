import type {ManifestV2} from './manifestV2';
import {securityOf} from './securityPolicy';
export interface PermissionRow {id:string;title:string;description?:string;params?:Record<string,string>;targets?:string[];reason?:string;runtime?:boolean;icon:'file'|'network'|'agent'|'clipboard'|'secret'|'other'}
/** Pure display only. All targets/reasons stay plain text, never extension-provided HTML. */
export function permissionRows(m:ManifestV2):PermissionRow[] {
 const s=securityOf(m),rows:PermissionRow[]=[];
 const read=(s.fs?.read??'none')!=='none'||m.permissions.includes('project.read');
 const write=(s.fs?.write??'none')!=='none'||m.permissions.includes('project.write');
 if(read||write)rows.push({id:'project',title:read&&write?'filesBoth':read?'filesRead':'filesWrite',description:read&&write?'filesBothBody':read?'filesReadBody':'filesWriteBody',icon:'file'});
 for(const n of s.network??[])rows.push({id:`network.${n.host}`,title:'network',targets:[n.host,...(n.paths?.map(p=>p.endsWith('*')?p.slice(0,-1):p)??[])],description:n.paths?'pathPrefix':'allPaths',reason:n.reason,icon:'network'});
 if(s.agent)rows.push({id:'agent',title:'agent',description:'agentBody',reason:s.agent.reason,icon:'agent'});
 if(s.clipboardWrite)rows.push({id:'clipboard.write',title:'clipboardWrite',description:'clipboardWriteBody',icon:'clipboard'});
 if(s.clipboardRead)rows.push({id:'clipboard.read',title:'asks',description:'clipboardReadBody',reason:s.clipboardRead.reason,runtime:true,icon:'clipboard'});
 for(const op of ['read','write'] as const)if(s.fs?.[op]==='ask')rows.push({id:`fs.${op}`,title:'asks',description:op==='read'?'outsideRead':'outsideWrite',runtime:true,icon:'file'});
 for(const slot of s.secrets??[])rows.push({id:`secret.${slot}`,title:'secret',description:'secretBody',targets:[slot,...(s.inject??[]).filter(i=>i.secret===slot).map(i=>`${i.host} / ${i.header}${i.prefix?` (${i.prefix})`:''}`)],icon:'secret'});
 const known=['project.read','project.write','network','agent','clipboard.read','clipboard.write','fs.read','fs.write','secrets'];
 for(const p of m.permissions)if(!known.includes(p))rows.push({id:`permission.${p}`,title:'hostCapability',targets:[p],icon:'other'});
 // Additional trust-bearing declarations must not disappear behind a friendly capability summary.
 rows.push({id:'runtime',title:'runtime',targets:[m.runtime.type,...(m.runtime.entry?[m.runtime.entry]:[]),...(m.runtime.abi?[m.runtime.abi]:[])],icon:'other'});
 if(m.activationEvents.length)rows.push({id:'activation',title:'activation',targets:m.activationEvents,icon:'other'});
 rows.push({id:'workspace',title:'workspace',targets:[m.capabilities.untrustedWorkspaces.supported,String(m.capabilities.virtualWorkspaces.supported),...(m.capabilities.untrustedWorkspaces.allowedPermissions??[])],icon:'other'});
 for(const p of m.proposedApis??[])rows.push({id:`proposal.${p.id}`,title:'proposal',targets:[`${p.id} / ${p.revision}`],icon:'other'});
 return rows;
}
export function diffPermissionRows(old:ManifestV2,next:ManifestV2) {
 const before=permissionRows(old),after=permissionRows(next);
 const same=(a:PermissionRow,b:PermissionRow)=>JSON.stringify(a)===JSON.stringify(b);
 return {
  changed:after.filter(r=>!before.some(b=>same(r,b))).map(row=>({row,before:before.find(b=>b.id===row.id)})),
  unchanged:after.filter(r=>before.some(b=>same(r,b))),
  removed:before.filter(r=>!after.some(a=>a.id===r.id)),
 };
}
