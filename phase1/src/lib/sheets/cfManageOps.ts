import type {CfManageOp,CfRuleInfo} from './protocol';
/** Managing the highlight rules of a sheet: validation of untrusted command input and of bridge answers. The Rust bridge re-validates. */
export const CF_MANAGE_KINDS=['delete','moveUp','moveDown','moveTop','moveBottom'] as const;
export const MAX_CF_RULES=200;
export function parseCfManageCommand(input:unknown):CfManageOp{
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Rule operation must be an object.');
 const o=input as Record<string,unknown>;if(Object.keys(o).some(k=>k!=='kind'&&k!=='index'))throw Error('Unknown rule field.');
 if(typeof o.kind!=='string'||!(CF_MANAGE_KINDS as readonly string[]).includes(o.kind))throw Error('Unsupported rule operation.');
 if(typeof o.index!=='number'||!Number.isInteger(o.index)||o.index<0||o.index>=MAX_CF_RULES)throw Error('Pick a rule.');
 return {kind:o.kind as CfManageOp['kind'],index:o.index};
}
/** The bridge's rule list, bounded and cleaned. */
export function parseCfRules(raw:unknown):CfRuleInfo[]{
 const list=(raw as {rules?:unknown}|null)?.rules;if(!Array.isArray(list))return [];const out:CfRuleInfo[]=[];
 for(const r of list.slice(0,MAX_CF_RULES)){const o=r as Record<string,unknown>|null;if(!o||typeof o!=='object'||typeof o.index!=='number'||typeof o.kind!=='string')continue;
  const detail:Record<string,string|number|boolean>={};if(o.detail&&typeof o.detail==='object')for(const [k,v] of Object.entries(o.detail as Record<string,unknown>).slice(0,16)){if(typeof v==='string')detail[k.slice(0,16)]=v.slice(0,100);else if(typeof v==='number'||typeof v==='boolean')detail[k.slice(0,16)]=v;}
  out.push({index:o.index,ranges:Array.isArray(o.ranges)?o.ranges.filter((x):x is string=>typeof x==='string').slice(0,8).map(x=>x.slice(0,40)):[],kind:o.kind.slice(0,24),detail,stop:o.stop===true});}
 return out;
}
/** One short line describing a rule for the list; `label` turns a rule kind into its translated name. */
export function describeCfRule(rule:CfRuleInfo,label:(kind:string)=>string):string{
 const d=rule.detail,parts=[label(rule.kind)];
 for(const k of ['op','a','b','text','formula','period','set'])if(d[k]!==undefined&&d[k]!=='')parts.push(String(d[k]));
 if(typeof d.rank==='number')parts.push(String(d.rank));
 return parts.join(' ')+' · '+(rule.ranges.join(', ')||'-');
}
