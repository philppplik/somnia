import {EditorProject} from '@somnia/editor-core';
import type {EditorNode} from '../editorPort';
import type {DocumentSnapshot} from './documentCore';
import {validateHTML} from './codeStudio';
export type VisionDestination='text'|'alt';
/** Model text is data. Only host-selected targets and parser-backed attributes are supported. */
export function visionApplication(base:DocumentSnapshot,text:string,destination:VisionDestination,nodes:readonly EditorNode[],nodeId:string|null):string{
 if(base.ref.adapter!=='code-v1'||base.ref.studioKind!=='code')throw Error('Choose an open Code Markdown document, or a selected HTML image.');
 if(!text.trim()||text.length>12000||text.includes('\0'))throw Error('Description must contain 1-12000 characters and no binary data.');
 if(destination==='text'){
  if(!/\.md$/i.test(base.ref.path))throw Error('Text insertion supports Markdown source only.');
  // A fenced block keeps markup, links and image instructions inert. Fence exceeds any model run.
  const longest=Math.max(2,...(text.match(/`+/g)??[]).map(s=>s.length));const fence='`'.repeat(longest+1);
  return base.text+'\n\n'+fence+'text\n'+text+'\n'+fence+'\n';
 }
 if(!/\.html?$/i.test(base.ref.path))throw Error('Alt text requires an HTML source document.');
 let target:EditorNode|undefined;let locked=false;
 const visit=(list:readonly EditorNode[],inherited=false)=>{for(const n of list){if(n.id===nodeId){target=n;locked=inherited||n.locked;}visit(n.children,inherited||n.locked);}};visit(nodes);
 if(!target||target.tag.toLowerCase()!=='img'||locked)throw Error('Select an unlocked HTML img element for alt text.');
 const project=new EditorProject({[base.ref.path]:base.text});
 const flat=(list:readonly EditorNode[]):EditorNode[]=>list.flatMap(n=>[n,...flat(n.children)]);
 const actual=flat(project.tree(base.ref.path)).find(n=>n.from===target!.from&&n.tag===target!.tag);
 if(!actual)throw Error('Selected image source changed.');
 project.transact({origin:'ai',operations:[{type:'setAttribute',file:base.ref.path,nodeId:actual.id,name:'alt',value:text}]});
 const after=project.files[base.ref.path];validateHTML(after);return after;
}
