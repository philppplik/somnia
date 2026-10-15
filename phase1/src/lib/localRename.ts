import {EditorState} from '@codemirror/state';
import {ensureSyntaxTree} from '@codemirror/language';
import {languageFor} from './languages';
import {findLocalDefinition} from './localDefinition';
export interface LocalRenameReview {file:string;before:string;after:string;oldName:string;newName:string;spans:readonly {from:number;to:number}[]}
/** Deliberately small lexical rename. No project-wide search or implicit property/type rewrites. */
export function reviewLocalRename(file:string,raw:string,from:number,to:number,newName:string):LocalRenameReview {
 if(raw.length>32000||!/^[A-Za-z_$][A-Za-z0-9_$]{0,79}$/.test(newName)||['arguments','eval'].includes(newName))throw Error('unsupported');
 const target=findLocalDefinition(file,raw,from,to);if(target.status!=='found'||newName===target.name)throw Error('unsupported');
 const state=EditorState.create({doc:raw,extensions:[languageFor(file)]}),tree=ensureSyntaxTree(state,raw.length,200);if(!tree)throw Error('unsupported');
 const identifiers:{from:number;to:number;name:string;binding:ReturnType<typeof findLocalDefinition>}[]=[];let unsafe=false,localTarget=false;
 tree.iterate({enter(node){if(node.type.isError)unsafe=true;
  // Shorthand keys, JSX and type names need separate semantic rules. Refuse the entire file.
  if(node.name.startsWith('JSX')||node.name==='TypeName'||(node.name==='PropertyDefinition'&&node.node.parent?.name==='Property'&&!node.node.parent.getChild(':')))unsafe=true;
  if(node.name==='VariableName'||node.name==='VariableDefinition'){
   if(identifiers.length>=160){unsafe=true;return false;}
   const binding=findLocalDefinition(file,raw,node.from,node.to);identifiers.push({from:node.from,to:node.to,name:raw.slice(node.from,node.to),binding});
   if(node.from===target.from){let parent=node.node.parent;if(parent?.name==='FunctionDeclaration'||parent?.name==='FunctionExpression')parent=parent.parent;for(;parent;parent=parent.parent)if(['FunctionDeclaration','FunctionExpression','ArrowFunction'].includes(parent.name))localTarget=true;}
  }
 }});
 if(unsafe||!localTarget||identifiers.length>160)throw Error('unsupported');
 const spans=identifiers.filter(n=>n.binding.status==='found'&&n.binding.from===target.from&&n.binding.to===target.to).map(({from,to})=>({from,to}));if(!spans.length)throw Error('unsupported');
 const shift=(position:number)=>position+spans.filter(s=>s.to<=position).length*(newName.length-target.name.length);
 let after=raw;for(const span of [...spans].reverse())after=after.slice(0,span.from)+newName+after.slice(span.to);
 // Verify every variable binding, not only renamed references. This detects capture in both directions.
 for(const identifier of identifiers){const renamed=spans.some(s=>s.from===identifier.from);const start=shift(identifier.from),end=start+(renamed?newName.length:identifier.to-identifier.from);const next=findLocalDefinition(file,after,start,end),previous=identifier.binding;
  if(previous.status==='found'){
   if(next.status!=='found'||next.from!==shift(previous.from)||next.to!==shift(previous.from)+(previous.from===target.from?newName.length:previous.to-previous.from))throw Error('collision');
  }else if(previous.status==='missing'){if(next.status!=='missing')throw Error('collision');}
  else throw Error('unsupported');
 }
 return {file,before:raw,after,oldName:target.name,newName,spans};
}
