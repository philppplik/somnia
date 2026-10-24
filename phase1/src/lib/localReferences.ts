import {EditorState} from '@codemirror/state';import {ensureSyntaxTree} from '@codemirror/language';import {languageFor,modeFor} from './languages';import {findLocalDefinition} from './localDefinition';
export interface LocalReference {from:number;to:number;line:number;column:number;preview:string;declaration:boolean}
export type LocalReferencesResult={status:'ready';name:string;rows:LocalReference[]}|{status:'language'|'budget'|'syntax'|'unsupported'|'missing'};
/** Same proven lexical binding, never same spelling alone. Complete bounded file or no list. */
export function collectLocalReferences(file:string,raw:string,from:number,to=from):LocalReferencesResult {
 const mode=modeFor(file);if(mode!=='javascript'&&mode!=='typescript')return {status:'language'};
 if(raw.length>32000)return {status:'budget'};
 const state=EditorState.create({doc:raw,extensions:[languageFor(file)]}),tree=ensureSyntaxTree(state,raw.length,200);if(!tree||tree.length!==raw.length)return {status:'syntax'};
 const identifiers:{from:number;to:number}[]=[];let failure:'syntax'|'budget'|'unsupported'|null=null;
 tree.iterate({enter(node){if(failure)return false;if(node.type.isError){failure='syntax';return false;}
  // These constructs have extra meanings beyond lexical variable references.
  if(node.name.startsWith('JSX')||node.name==='TypeName'||(node.name==='PropertyDefinition'&&node.node.parent?.name==='Property'&&!node.node.parent.getChild(':'))){failure='unsupported';return false;}
  if(node.name==='VariableName'||node.name==='VariableDefinition'){if(identifiers.length>=160){failure='budget';return false;}identifiers.push({from:node.from,to:node.to});}
 }});if(failure)return {status:failure};
 const target=findLocalDefinition(file,raw,from,to);if(target.status!=='found')return {status:target.status==='missing'?'missing':'unsupported'};
 const lines=raw.split('\n'),starts=[0];for(let i=0;i<raw.length;i++)if(raw[i]==='\n')starts.push(i+1);
 const rows:LocalReference[]=[];for(const identifier of identifiers){if(raw.slice(identifier.from,identifier.to)!==target.name)continue;const binding=findLocalDefinition(file,raw,identifier.from,identifier.to);if(binding.status!=='found'||binding.from!==target.from||binding.to!==target.to)continue;
  let low=0,high=starts.length;while(low+1<high){const mid=(low+high)>>1;if(starts[mid]<=identifier.from)low=mid;else high=mid;}
  const column=identifier.from-starts[low],line=lines[low];const start=Math.max(0,column-60),end=Math.min(line.length,column+target.name.length+100);
  rows.push({...identifier,line:low+1,column:column+1,preview:(start?'…':'')+line.slice(start,end)+(end<line.length?'…':''),declaration:identifier.from===target.from});
 }return {status:'ready',name:target.name,rows};
}
