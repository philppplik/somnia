import {EditorState} from '@codemirror/state';
import {ensureSyntaxTree} from '@codemirror/language';
import type {SyntaxNode} from '@lezer/common';
import {languageFor,modeFor} from './languages';
export type SymbolKind='function'|'class'|'variable'|'method'|'field'|'interface'|'type'|'enum'|'namespace';
export interface CodeSymbol {name:string;kind:SymbolKind;from:number;to:number;line:number;column:number;container:string}
export type CodeSymbolsResult={status:'ready';symbols:readonly CodeSymbol[]}|{status:'language'|'budget'|'syntax';symbols:readonly []};
const declarations:Record<string,{kind:SymbolKind;name:string}>={
 FunctionDeclaration:{kind:'function',name:'VariableDefinition'},ClassDeclaration:{kind:'class',name:'VariableDefinition'},
 InterfaceDeclaration:{kind:'interface',name:'TypeDefinition'},TypeAliasDeclaration:{kind:'type',name:'TypeDefinition'},
 EnumDeclaration:{kind:'enum',name:'TypeDefinition'},NamespaceDeclaration:{kind:'namespace',name:'VariableDefinition'},
 MethodDeclaration:{kind:'method',name:'PropertyDefinition'},PropertyDeclaration:{kind:'field',name:'PropertyDefinition'},
};
/** Syntax positions only, never binding/reference resolution. Refuse partial or budget-limited parses. */
export function collectCodeSymbols(file:string,raw:string):CodeSymbolsResult {
 if(!['javascript','typescript'].includes(modeFor(file)))return {status:'language',symbols:[]};
 if(raw.length>100000)return {status:'budget',symbols:[]};
 const state=EditorState.create({doc:raw,extensions:[languageFor(file)]}),tree=ensureSyntaxTree(state,raw.length,100);
 if(!tree||tree.length!==raw.length)return {status:'budget',symbols:[]};
 const symbols:CodeSymbol[]=[];let failure:'budget'|'syntax'|null=null,nodes=0;
 function add(name:SyntaxNode,kind:SymbolKind,container:string){
  const text=raw.slice(name.from,name.to);if(!text||text.length>160)return;
  const line=state.doc.lineAt(name.from);symbols.push({name:text,kind,from:name.from,to:name.to,line:line.number,column:name.from-line.from+1,container});
  if(symbols.length>500)failure='budget';
 }
 function visit(node:SyntaxNode,depth:number,container:string){
  if(failure)return;if(++nodes>10000||depth>80){failure='budget';return;}if(node.type.isError){failure='syntax';return;}
  const declaration=declarations[node.name];let childContainer=container;
  if(declaration){const name=node.getChild(declaration.name)??(node.name==='PropertyDeclaration'||node.name==='MethodDeclaration'?node.getChild('PrivatePropertyDefinition'):null);if(name){add(name,declaration.kind,container);childContainer=[container,raw.slice(name.from,name.to)].filter(Boolean).join(' > ');}}
  // Only direct simple declarators. Parameters, import aliases and destructuring are not an outline entry.
  if(node.name==='VariableDefinition'&&node.parent?.name==='VariableDeclaration')add(node,'variable',container);
  let declaratorContainer=childContainer;
  for(let child=node.firstChild;child;child=child.nextSibling){
   if(node.name==='VariableDeclaration'){
    if(child.name===',')declaratorContainer=childContainer;
    if(child.name==='VariableDefinition')declaratorContainer=[childContainer,raw.slice(child.from,child.to)].filter(Boolean).join(' > ');
   }
   visit(child,depth+1,child.name==='VariableDefinition'?childContainer:declaratorContainer);
  }
 }
 visit(tree.topNode,0,'');if(failure)return {status:failure,symbols:[]};
 return {status:'ready',symbols:symbols.sort((a,b)=>a.from-b.from)};
}
export function filterCodeSymbols(symbols:readonly CodeSymbol[],query:string){const words=query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);return symbols.filter(s=>words.every(word=>`${s.name} ${s.container}`.toLocaleLowerCase().includes(word)));}
