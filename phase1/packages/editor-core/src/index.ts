import { parse, type DefaultTreeAdapterMap } from 'parse5';
const randomUUID = () => globalThis.crypto.randomUUID();
export type Origin = 'canvas' | 'code' | 'history' | 'external' | 'internal';
export interface EditorNode { id:string; tag:string; attrs:Record<string,string>; children:EditorNode[]; from:number; to:number; contentFrom:number; contentTo:number; locked:boolean; hidden:boolean }
export type Operation =
 | {type:'setText';file:string;nodeId:string;text:string}
 | {type:'setAttribute';file:string;nodeId:string;name:string;value:string|null}
 | {type:'setStyle';file:string;nodeId:string;properties:Record<string,string|null>;cssFile?:string;breakpoint?:number}
 | {type:'insertHTML';file:string;parentId:string;html:string;beforeId?:string}
 | {type:'remove';file:string;nodeId:string}
 | {type:'move';file:string;nodeId:string;parentId:string;beforeId?:string}
 | {type:'replaceSource';file:string;text:string}
 | {type:'setMeta';file:string;nodeId:string;locked?:boolean;hidden?:boolean};
export interface Request { origin:Origin; operations:Operation[]; expectedRevision?:number; group?:string }
export interface Patch { file:string; from:number; to:number; insert:string }
export interface Transaction { id:string; origin:Origin; revision:number; operations:Operation[]; patches:Patch[]; changedFiles:string[] }
type PElement = DefaultTreeAdapterMap['element'];
type Meta = {locked:boolean;hidden:boolean};
type Snapshot = {files:Record<string,string>; ids:Record<string,Array<{id:string;from:number;tag:string}>>; meta:Record<string,Meta>};
type History = {before:Snapshot;after:Snapshot;group?:string;at:number;origin:Origin};
const escText=(s:string)=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const escAttr=(s:string,q:string)=>s.replace(/&/g,'&amp;').replace(new RegExp(q,'g'),q==='"'?'&quot;':'&#39;').replace(/</g,'&lt;');
const isElement=(n:DefaultTreeAdapterMap['node']):n is PElement=>'tagName' in n;
const clone=<T>(x:T):T=>structuredClone(x);
const shortId=()=>randomUUID().replaceAll('-','').slice(0,12);
export class EditorError extends Error { constructor(public code:string,message:string){super(message);this.name='EditorError';} }
export class EditorProject {
 private sources:Record<string,string>;
 private trees:Record<string,EditorNode[]>={};
 private metas:Record<string,Meta>={};
 private bindings:Record<string,Map<string,PElement>>={};
 private listeners=new Set<{origin:Origin;fn:(tx:Transaction)=>void}>();
 private past:History[]=[]; private future:History[]=[];
 private busy=false; private _revision=0;
 constructor(files:Record<string,string>){this.sources={...files};for(const f in files)this.reparse(f);}
 get files():Readonly<Record<string,string>>{return Object.freeze({...this.sources});}
 get revision(){return this._revision;}
 exportState(){return {version:1 as const,revision:this.revision,snapshot:this.snapshot()};}
 static fromState(state:{version:1;revision:number;snapshot:Snapshot}){if(state.version!==1||!state.snapshot?.files)throw new EditorError('invalid-recovery','Recovery data is not a supported editor state.');const p=new EditorProject(state.snapshot.files);p.restore(state.snapshot);p._revision=state.revision;return p;}
 get canUndo(){return this.past.length>0;}
 get canRedo(){return this.future.length>0;}
 tree(file:string):EditorNode[]{if(!(file in this.sources))throw new EditorError('missing-file',`File not found: ${file}`);return clone(this.trees[file]||[]);}
 node(file:string,id:string):EditorNode{let found:EditorNode|undefined;const walk=(ns:EditorNode[])=>{for(const n of ns){if(n.id===id)found=n;walk(n.children);}};walk(this.trees[file]||[]);if(!found)throw new EditorError('missing-node','The selected element no longer exists. Select it again.');return clone(found);}
 subscribe(origin:Origin,fn:(tx:Transaction)=>void){const l={origin,fn};this.listeners.add(l);return()=>{this.listeners.delete(l);};}
 private snapshot():Snapshot{const ids:Snapshot['ids']={};for(const [f,nodes] of Object.entries(this.trees)){ids[f]=[];const walk=(ns:EditorNode[])=>{for(const n of ns){ids[f].push({id:n.id,from:n.from,tag:n.tag});walk(n.children);}};walk(nodes);}return {files:{...this.sources},ids,meta:clone(this.metas)};}
 private restore(s:Snapshot){this.sources={...s.files};this.metas=clone(s.meta);this.trees={};this.bindings={};for(const f in this.sources)this.reparse(f,s.ids[f]);}
 private reparse(file:string,hints?:Snapshot['ids'][string]){
  if(!/\.html?$/i.test(file)){this.trees[file]=[];return;}
  const old=hints||this.snapshotIds(file);const byPos=new Map(old.map(x=>[x.from+':'+x.tag,x.id]));
  const root=parse(this.sources[file],{sourceCodeLocationInfo:true});const bindings=new Map<string,PElement>();
  const walk=(ns:DefaultTreeAdapterMap['node'][]):EditorNode[]=>ns.flatMap(n=>{
   if(!isElement(n))return [];
   const loc=n.sourceCodeLocation;const kids=walk(n.childNodes);
   if(!loc?.startTag)return kids; // Browser-created implied elements are not editable source nodes.
   const id=byPos.get(loc.startOffset+':'+n.tagName)||'node-'+shortId();bindings.set(id,n);
   const meta=this.metas[id]||{locked:false,hidden:false};
   return [{id,tag:n.tagName,attrs:Object.fromEntries(n.attrs.map(a=>[a.name,a.value])),children:kids,from:loc.startOffset,to:loc.endOffset,contentFrom:loc.startTag.endOffset,contentTo:loc.endTag?.startOffset??loc.endOffset,...meta}];
  });
  this.trees[file]=walk(root.childNodes);this.bindings[file]=bindings;
 }
 private snapshotIds(file:string){const a:Array<{id:string;from:number;tag:string}>=[];const walk=(ns:EditorNode[])=>{for(const n of ns){a.push({id:n.id,from:n.from,tag:n.tag});walk(n.children);}};walk(this.trees[file]||[]);return a;}
 private patch(p:Patch,extraHints:Array<{id:string;from:number;tag:string}>=[]){
  const source=this.sources[p.file];if(source==null||p.from<0||p.to<p.from||p.to>source.length)throw new EditorError('invalid-range','Cannot safely map this change to source code.');
  const delta=p.insert.length-(p.to-p.from);
  const ids=this.snapshotIds(p.file).flatMap(n=>{
   if(n.from>=p.from&&n.from<p.to)return [];
   return [{...n,from:n.from>=p.to?n.from+delta:n.from}];
  });
  this.sources[p.file]=source.slice(0,p.from)+p.insert+source.slice(p.to);
  this.reparse(p.file,[...ids,...extraHints]);
 }
 private editable(file:string,id:string){const n=this.node(file,id);if(n.locked)throw new EditorError('locked','This layer is locked. Unlock it first.');const visit=(nodes:EditorNode[],locked:boolean):boolean=>nodes.some(p=>p.id===id?locked:p.children.length?visit(p.children,locked||p.locked):false);if(visit(this.trees[file]||[],false))throw new EditorError('locked','A parent layer is locked. Unlock it first.');return n;}
 private container(file:string,id:string){const n=this.editable(file,id);const el=this.bindings[file]?.get(id);if(!el?.sourceCodeLocation?.endTag)throw new EditorError('unsupported-container','This element has no explicit closing tag. Add one in code before inserting content.');if(['script','style','textarea','title','iframe','object'].includes(n.tag))throw new EditorError('unsafe-container','Use the code editor for this element.');return n;}
 private attribute(file:string,id:string,name:string,value:string|null,patches:Patch[]){
  const n=this.editable(file,id);if(!/^[a-zA-Z_:][a-zA-Z0-9_.:-]*$/.test(name)||/^data-somnia-/i.test(name))throw new EditorError('invalid-attribute','Choose a valid non-reserved attribute name.');
  const el=this.bindings[file]!.get(id)!;const loc=el.sourceCodeLocation!;const attr=loc.attrs?.[name.toLowerCase()];let p:Patch;
  if(attr){const raw=this.sources[file].slice(attr.startOffset,attr.endOffset);const quote=raw.match(/=\s*(["'])/)?.[1]||'"';p={file,from:attr.startOffset,to:attr.endOffset,insert:value===null?'':`${raw.match(/^[^\s=]+/)![0]}=${quote}${escAttr(value,quote)}${quote}`};}
  else {if(value===null)return;const at=loc.startTag!.endOffset-(this.sources[file].slice(loc.startTag!.startOffset,loc.startTag!.endOffset).endsWith('/>')?2:1);p={file,from:at,to:at,insert:` ${name}="${escAttr(value,'"')}"`};}
  if(this.sources[file].slice(p.from,p.to)===p.insert)return;this.patch(p);patches.push(p);
 }
 private operation(op:Operation,patches:Patch[]){
  if(!(op.file in this.sources))throw new EditorError('missing-file',`File not found: ${op.file}`);
  const add=(p:Patch,hints?:Array<{id:string;from:number;tag:string}>)=>{if(this.sources[p.file].slice(p.from,p.to)===p.insert)return;this.patch(p,hints);patches.push(p);};
  switch(op.type){
   case 'replaceSource': {const a=this.sources[op.file],b=op.text;let from=0;while(from<a.length&&from<b.length&&a[from]===b[from])from++;let endA=a.length,endB=b.length;while(endA>from&&endB>from&&a[endA-1]===b[endB-1]){endA--;endB--;}add({file:op.file,from,to:endA,insert:b.slice(from,endB)});break;}
   case 'setText': {const n=this.editable(op.file,op.nodeId);const el=this.bindings[op.file]!.get(n.id)!;if(n.children.length||el.childNodes.some(c=>c.nodeName!=='#text')||['script','style','textarea','title'].includes(n.tag)||!el.sourceCodeLocation?.endTag)throw new EditorError('mixed-content','This element contains markup or non-text content. Edit the text child or use code; it will not be flattened.');add({file:op.file,from:n.contentFrom,to:n.contentTo,insert:escText(op.text)});break;}
   case 'setAttribute':this.attribute(op.file,op.nodeId,op.name,op.value,patches);break;
   case 'setMeta': {const n=this.node(op.file,op.nodeId);this.metas[n.id]={locked:op.locked??n.locked,hidden:op.hidden??n.hidden};this.reparse(op.file);break;}
   case 'insertHTML': {const p=this.container(op.file,op.parentId);let at=p.contentTo;if(op.beforeId){const target=p.children.find(n=>n.id===op.beforeId);if(!target)throw new EditorError('invalid-drop','Drop target is not a direct child.');at=target.from;}add({file:op.file,from:at,to:at,insert:op.html});break;}
   case 'remove': {const n=this.editable(op.file,op.nodeId);if(['html','head','body'].includes(n.tag))throw new EditorError('protected-root','The document root cannot be deleted.');add({file:op.file,from:n.from,to:n.to,insert:''});break;}
   case 'move': {const n=this.editable(op.file,op.nodeId);const parent=this.container(op.file,op.parentId);if(['html','head','body'].includes(n.tag)||parent.from>=n.from&&parent.to<=n.to)throw new EditorError('invalid-drop','An element cannot be moved into itself or its descendants.');let at=parent.contentTo;if(op.beforeId){const t=parent.children.find(x=>x.id===op.beforeId);if(!t)throw new EditorError('invalid-drop','Drop target is not a direct child.');at=t.from;}
    if(at>=n.from&&at<=n.to)return;
    const ids=this.snapshotIds(op.file).filter(x=>x.from>=n.from&&x.from<n.to);const raw=this.sources[op.file].slice(n.from,n.to);add({file:op.file,from:n.from,to:n.to,insert:''});if(at>n.to)at-=n.to-n.from;add({file:op.file,from:at,to:at,insert:raw},ids.map(x=>({...x,from:at+x.from-n.from})));break;}
   case 'setStyle': {let n=this.editable(op.file,op.nodeId);const cssFile=op.cssFile||'somnia-styles.css';if(!/^[\w./-]+\.css$/.test(cssFile)||cssFile.split('/').includes('..')||cssFile.startsWith('/'))throw new EditorError('invalid-css-file','Stylesheet must be a project-relative CSS file.');if(op.breakpoint!=null&&(!Number.isInteger(op.breakpoint)||op.breakpoint<1))throw new EditorError('invalid-breakpoint','Choose a positive breakpoint width.');
    if(n.attrs.style&&Object.keys(op.properties).some(k=>new RegExp('(?:^|;)\\s*'+k+'\\s*:','i').test(n.attrs.style)))throw new EditorError('inline-cascade','This property is controlled by an inline style. Edit or remove that declaration in code before applying a class rule.');
    const props=Object.entries(op.properties).filter(([,v])=>v!==null);for(const [k,v] of props)if(!/^(--[\w-]+|[a-z][a-z-]*)$/.test(k)||/[{};]|<\/style/i.test(v!))throw new EditorError('invalid-style','Use one CSS property value at a time.');
    if(!props.length)throw new EditorError('unsupported-style-removal','Resetting a generated rule requires editing its CSS source. No existing cascade rules will be silently deleted.');
    let cls=n.attrs.class?.split(/\s+/).find(c=>/^element-[a-f0-9]{12}$/.test(c));if(!cls){cls='element-'+shortId();this.attribute(op.file,n.id,'class',((n.attrs.class||'')+' '+cls).trim(),patches);n=this.node(op.file,n.id);}
    const base=op.file.split('/').slice(0,-1),target=cssFile.split('/');let common=0;while(common<base.length&&common<target.length&&base[common]===target[common])common++;const href='../'.repeat(base.length-common)+target.slice(common).join('/');let head:EditorNode|undefined;const walk=(ns:EditorNode[])=>{for(const t of ns){if(t.tag==='head')head=t;walk(t.children);}};walk(this.trees[op.file]);
    const linked=(ns:EditorNode[]):boolean=>ns.some(t=>t.tag==='link'&&t.attrs.rel?.split(/\s+/).includes('stylesheet')&&t.attrs.href===href||linked(t.children));
    if(!linked(this.trees[op.file])){if(!head)throw new EditorError('missing-head','Add an explicit head element before editing visual styles.');this.operation({type:'insertHTML',file:op.file,parentId:head.id,html:`\n<link rel="stylesheet" href="${href}">\n`},patches);}
    if(!(cssFile in this.sources))this.sources[cssFile]='';const rule=`.${cls} { ${props.map(([k,v])=>`${k}: ${v};`).join(' ')} }`;const txt=`\n${op.breakpoint?`@media (max-width: ${op.breakpoint}px) { ${rule} }`:rule}\n`;add({file:cssFile,from:this.sources[cssFile].length,to:this.sources[cssFile].length,insert:txt});break;}
  }
 }
 transact(req:Request):Transaction|null {
  if(this.busy)throw new EditorError('reentry','A change is already being applied.');if(req.expectedRevision!=null&&req.expectedRevision!==this.revision)throw new EditorError('conflict','The document changed since this edit started. Review the latest version.');
  this.busy=true;const before=this.snapshot();const patches:Patch[]=[];let tx:Transaction|null=null;
  try {for(const op of req.operations)this.operation(op,patches);const after=this.snapshot();if(JSON.stringify(before.files)===JSON.stringify(after.files)&&JSON.stringify(before.meta)===JSON.stringify(after.meta))return null;
   this._revision++;tx={id:randomUUID(),origin:req.origin,revision:this.revision,operations:clone(req.operations),patches,changedFiles:[...new Set([...Object.keys(before.files),...Object.keys(after.files)].filter(f=>before.files[f]!==after.files[f]))]};
   if(req.origin!=='internal'){const last=this.past.at(-1),now=Date.now();if(req.group&&last?.group===req.group&&last.origin===req.origin&&now-last.at<800){last.after=after;last.at=now;}else{this.past.push({before,after,group:req.group,at:now,origin:req.origin});if(this.past.length>200)this.past.shift();}this.future=[];}
  }catch(e){this.restore(before);throw e;}finally{this.busy=false;}
  if(tx)this.emit(tx);return tx;
 }
 private emit(tx:Transaction){this.busy=true;try{for(const l of this.listeners)if(l.origin!==tx.origin){try{l.fn(tx);}catch(e){console.error('Editor subscriber failed',e);}}}finally{this.busy=false;}}
 private history(undo:boolean){const from=undo?this.past:this.future,to=undo?this.future:this.past,h=from.pop();if(!h)return null;const old={...this.sources};this.restore(undo?h.before:h.after);to.push(h);this._revision++;const tx:Transaction={id:randomUUID(),origin:'history',revision:this.revision,operations:[],patches:[],changedFiles:[...new Set([...Object.keys(old),...Object.keys(this.sources)].filter(f=>old[f]!==this.sources[f]))]};this.emit(tx);return tx;}
 undo(){return this.history(true);}
 redo(){return this.history(false);}
}
