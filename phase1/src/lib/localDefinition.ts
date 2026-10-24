import {EditorState} from '@codemirror/state';
import {ensureSyntaxTree} from '@codemirror/language';
import type {SyntaxNode} from '@lezer/common';
import {languageFor,modeFor} from './languages';
export type LocalDefinitionResult={status:'found';from:number;to:number;name:string}|{status:'unsupported'|'missing'|'ambiguous';reason:'language'|'budget'|'syntax'|'construct'|'selection'|'implicit'|'binding'};
interface Scope {parent?:Scope;definitions:Map<string,{from:number;to:number}[]>;functionKind?:string;functionBody?:boolean}
const functions=new Set(['FunctionDeclaration','FunctionExpression','ArrowFunction']);
const unsupported=new Set(['ImportDeclaration','ExportDeclaration','ObjectPattern','ArrayPattern','ClassDeclaration','ClassExpression','MethodDeclaration','ForStatement','ForInStatement','ForOfStatement','TryStatement','CatchClause','WithStatement','TypeAliasDeclaration','InterfaceDeclaration','EnumDeclaration','NamespaceDeclaration','TypeParameterList','DeclareDeclaration','TypeDefinition','declare','SwitchStatement','WhileStatement','DoStatement','for','while','do','switch','catch','with','using']);
/** Read-only, file-local lexical bindings only. A text search is never treated as a definition. */
export function findLocalDefinition(file:string,raw:string,from:number,to=from):LocalDefinitionResult {
 const mode=modeFor(file);if(mode!=='javascript'&&mode!=='typescript')return {status:'unsupported',reason:'language'};
 if(raw.length>200000||!Number.isSafeInteger(from)||!Number.isSafeInteger(to)||from<0||to<from||to>raw.length)return {status:'unsupported',reason:'budget'};
 const state=EditorState.create({doc:raw,extensions:[languageFor(file)]}),tree=ensureSyntaxTree(state,raw.length,200);
 if(!tree||tree.length!==raw.length)return {status:'unsupported',reason:'syntax'};
 const scopes=new Map<string,Scope>(),root:Scope={definitions:new Map()};let fail:LocalDefinitionResult|null=null,nodes=0;
 const key=(node:SyntaxNode)=>`${node.from}:${node.to}:${node.name}`;
 const add=(scope:Scope,node:SyntaxNode)=>{const name=raw.slice(node.from,node.to),list=scope.definitions.get(name)??[];if(list.length<2)list.push({from:node.from,to:node.to});scope.definitions.set(name,list);};
 function visit(node:SyntaxNode,scope:Scope,depth:number){
  if(fail)return;if(++nodes>20000||depth>100){fail={status:'unsupported',reason:'budget'};return;}
  if(node.type.isError){fail={status:'unsupported',reason:'syntax'};return;}
  if(node.name==='FunctionDeclaration'&&node.parent?.name!=='Script'&&!(node.parent?.name==='Block'&&functions.has(node.parent.parent?.name??''))){fail={status:'unsupported',reason:'construct'};return;}
  if(unsupported.has(node.name)||node.name==='var'||((node.name==='VariableName'||node.name==='VariableDefinition')&&(raw.slice(node.from,node.to)==='eval'||raw.slice(node.from,node.to).includes('\\')))){fail={status:'unsupported',reason:'construct'};return;}
  let inner=scope;const functionName=node.name==='FunctionDeclaration'||node.name==='FunctionExpression'?node.getChild('VariableDefinition'):null;
  if(node.name==='FunctionDeclaration'&&functionName)add(scope,functionName);
  if(functions.has(node.name))inner={parent:scope,definitions:new Map(),functionKind:node.name};
  else if(node.name==='Block')inner={parent:scope,definitions:new Map(),functionBody:functions.has(node.parent?.name??'')};
  if(node.name==='FunctionExpression'&&functionName)add(inner,functionName);
  scopes.set(key(node),inner);
  if(node.name==='VariableDefinition'&&!((node.parent?.name==='FunctionDeclaration'||node.parent?.name==='FunctionExpression')&&node.parent?.getChild('VariableDefinition')?.from===node.from))add(inner,node);
  for(let child=node.firstChild;child;child=child.nextSibling)visit(child,inner,depth+1);
 }
 visit(tree.topNode,root,0);if(fail)return fail;
 // Function-body lexical declarations may not redeclare parameters. Refuse rather than invent a second binding.
 for(const scope of new Set(scopes.values()))if(scope.functionBody&&scope.parent?.functionKind&&[...scope.definitions.keys()].some(name=>scope.parent!.definitions.has(name)))return {status:'ambiguous',reason:'binding'};
 const left=tree.resolveInner(from,-1),right=tree.resolveInner(from,1);
 const selected=[left,right].find(n=>(n.name==='VariableName'||n.name==='VariableDefinition')&&from>=n.from&&to<=n.to&&n.from<n.to);
 if(!selected)return {status:'unsupported',reason:'selection'};
 const name=raw.slice(selected.from,selected.to);if(name.includes('\\'))return {status:'unsupported',reason:'selection'};
 let scope=scopes.get(key(selected));
 if(name==='arguments')for(let s=scope;s;s=s.parent)if(s.functionKind&&s.functionKind!=='ArrowFunction')return {status:'unsupported',reason:'implicit'};
 // Function declaration names are bound in their surrounding scope, not parameter scope.
 if(selected.parent?.name==='FunctionDeclaration')scope=scope?.parent;
 for(let s=scope;s;s=s.parent){const definitions=s.definitions.get(name);if(definitions?.length){if(definitions.length!==1)return {status:'ambiguous',reason:'binding'};return {status:'found',...definitions[0],name};}}
 return {status:'missing',reason:'binding'};
}
