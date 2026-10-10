import type {ContributionV2,ManifestV2} from './manifestV2';
import {isValidWhen} from './manifestV2';
import {ExtensionError,type Disposable,type Json} from './contracts/v2/api';
export interface ContributionContext {studio:string;language:string;hasProject:boolean;hasSelection:boolean;workspaceTrusted:boolean;isReadonly:boolean}
/** Same closed grammar as the manifest validator. Evaluation never runs package code. */
export function evaluateWhen(source:string|undefined,context:ContributionContext):boolean {
 if(!source)return true;if(!isValidWhen(source))return false;
 const tokens=source.match(/\&\&|\|\||==|!=|!|\(|\)|"(?:[^"\\]|\\["\\])*"|'(?:[^'\\]|\\['\\])*'|[A-Za-z][A-Za-z0-9]*/g)!;let i=0;
 const atom=():boolean=>{
  if(tokens[i]==='!'){i++;return !atom();}if(tokens[i]==='('){i++;const v=or();i++;return v;}
  const key=tokens[i++];if(key==='true'||key==='false')return key==='true';const value=context[key as keyof ContributionContext];
  if(tokens[i]==='=='||tokens[i]==='!='){const op=tokens[i++],literal=tokens[i++];const expected=literal==='true'?true:literal==='false'?false:literal.slice(1,-1).replace(/\\(["'\\])/g,'$1');return op==='=='?value===expected:value!==expected;}
  return !!value;
 };
 const and=():boolean=>{let v=atom();while(tokens[i]==='&&'){i++;const rhs=atom();v=v&&rhs;}return v;};
 const or=():boolean=>{let v=and();while(tokens[i]==='||'){i++;const rhs=and();v=v||rhs;}return v;};return or();
}
export interface PreparedContribution {family:'commands'|'panels'|'themes'|'snippets';fullId:string;metadata:ContributionV2;asset?:Uint8Array}
export interface ContributionTransaction {
 stage(contribution:PreparedContribution):void;
 /** Publish all staged values together or throw without publishing. */
 commit():Disposable;
 rollback():void;
}
export interface ContributionSink {
 begin(extensionId:string):ContributionTransaction;
 /** Native theme/snippet/declarative-panel validator. Must not execute scripts or fetch assets. */
 validateAsset(contribution:PreparedContribution):void;
}
/** No runtime factory is touched for static themes/snippets/panels. All assets come from verified inventory. */
export class ContributionRegistry {
 private owners=new Map<string,Disposable>();private ids=new Map<string,string>();
 constructor(private readonly sink:ContributionSink){}
 register(manifest:ManifestV2,files:Readonly<Record<string,Uint8Array>>):void {
  if(this.owners.has(manifest.id))throw new ExtensionError('E_INVALID_ARGUMENT','Remove existing contributions before replacement.');
  const prepared:PreparedContribution[]=[];
  for(const family of ['commands','panels','themes','snippets'] as const)for(const metadata of manifest.contributes[family]??[]){
   const fullId=family==='commands'?metadata.id:`${manifest.id}.${metadata.id}`;const namespace=`${family}:${fullId}`;
   if(this.ids.has(namespace)||prepared.some(c=>`${c.family}:${c.fullId}`===namespace))throw new ExtensionError('E_INVALID_ARGUMENT','Contribution ID is already registered.');
   let asset:Uint8Array|undefined;if(metadata.path){if(!Object.hasOwn(files,metadata.path))throw new ExtensionError('E_INVALID_ARGUMENT','Contribution asset is missing.');asset=files[metadata.path].slice();}
   const contribution={family,fullId,metadata:structuredClone(metadata),asset};this.sink.validateAsset(contribution);prepared.push(contribution);
  }
  const tx=this.sink.begin(manifest.id);try{for(const c of prepared)tx.stage(c);const disposable=tx.commit();this.owners.set(manifest.id,disposable);for(const c of prepared)this.ids.set(`${c.family}:${c.fullId}`,manifest.id);}catch(error){tx.rollback();throw error;}
 }
 remove(id:string):void {this.owners.get(id)?.dispose();this.owners.delete(id);for(const [key,owner] of this.ids)if(owner===id)this.ids.delete(key);}
 dispose():void {for(const id of this.owners.keys())this.remove(id);}
}

export interface NativeContributionSnapshot {readonly items:ReadonlyMap<string,PreparedContribution>}
/** Concrete atomic data sink for native UI adapters. It stores no scripts, DOM or external URLs. */
export class NativeContributionStore implements ContributionSink {
 private items=new Map<string,PreparedContribution>();
 constructor(private readonly changed:(snapshot:NativeContributionSnapshot)=>void=()=>{},private readonly themeValidator:(tokens:Record<string,string>)=>boolean=defaultThemeValidator){}
 snapshot():NativeContributionSnapshot{return {items:new Map(this.items)};}
 validateAsset(c:PreparedContribution):void {
  if(c.family==='commands')return;
  if(!c.asset)throw new ExtensionError('E_INVALID_ARGUMENT','Static contribution requires an asset.');
  const max=c.family==='panels'?256*1024:c.family==='themes'?64*1024:32*1024;if(c.asset.length>max)throw new ExtensionError('E_RESOURCE_LIMIT','Contribution asset exceeds budget.');
  const text=new TextDecoder('utf-8',{fatal:true}).decode(c.asset);
  if(c.family==='panels'&&c.metadata.kind==='webview')return; // Render ONLY through the isolated panel bridge, never innerHTML in Somnia.
  const parsed=parseStrictJson(text);if(c.family==='themes'&&c.metadata.kind==='ui'&&this.themeValidator===defaultThemeValidator)throw new ExtensionError('E_INVALID_ARGUMENT','UI themes need the native token and contrast validator.');
  if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw new ExtensionError('E_INVALID_ARGUMENT','Invalid contribution data.');
  if(c.family==='themes'){
   if(!this.themeValidator(parsed as Record<string,string>))throw new ExtensionError('E_INVALID_ARGUMENT','Theme tokens or contrast checks failed.');
  }else if(c.family==='snippets'){
   if(typeof parsed.body!=='string'||Object.keys(parsed).some(k=>!['body','description'].includes(k))||('description'in parsed&&typeof parsed.description!=='string'))throw new ExtensionError('E_INVALID_ARGUMENT','Invalid snippet data.');
   snippet(parsed.body); // Uses Somnia's actual CodeMirror snippet parser, not shell/template evaluation.
  }else validateView(parsed,c,0);
 }
 begin(_extensionId:string):ContributionTransaction {
  const staged=new Map<string,PreparedContribution>();let committed=false;
  return {
   stage:c=>{if(committed)throw new ExtensionError('E_INVALID_ARGUMENT','Contribution transaction is closed.');const key=`${c.family}:${c.fullId}`;if(staged.has(key)||this.items.has(key))throw new ExtensionError('E_INVALID_ARGUMENT','Contribution collision.');staged.set(key,c);},
   commit:()=>{if(committed)throw new ExtensionError('E_INVALID_ARGUMENT','Contribution transaction is closed.');const next=new Map(this.items);for(const [key,c] of staged){if(next.has(key))throw new ExtensionError('E_INVALID_ARGUMENT','Contribution collision.');next.set(key,c);}this.changed({items:new Map(next)});this.items=next;committed=true;return {dispose:()=>{const current=new Map(this.items);for(const key of staged.keys())current.delete(key);this.items=current;this.changed(this.snapshot());}};},
   rollback:()=>{if(!committed)staged.clear();},
  };
 }
}
import {snippet} from '@codemirror/autocomplete';
import {parseStrictJson} from './v2/rpc';
function defaultThemeValidator(tokens:Record<string,string>):boolean {
 const allowed=new Set(['--syntax-tag','--syntax-keyword','--syntax-string','--syntax-number','--syntax-comment','--syntax-property','--syntax-variable','--syntax-operator','--syntax-function']);
 return Object.keys(tokens).length>0&&Object.entries(tokens).every(([key,value])=>allowed.has(key)&&typeof value==='string'&&/^#(?:[a-f\d]{3}|[a-f\d]{6}|[a-f\d]{8})$/i.test(value));
}
function validateView(view:Json,c:PreparedContribution,depth:number):void {
 if(depth>8||!view||typeof view!=='object'||Array.isArray(view)||!['text','button','input','select','list','group'].includes(view.type as string)||Object.keys(view).some(k=>!['type','text','label','value','command','children','options'].includes(k)))throw new ExtensionError('E_INVALID_ARGUMENT','Invalid declarative panel tree.');
 for(const key of ['text','label','value'])if(key in view&&typeof view[key]!=='string')throw new ExtensionError('E_INVALID_ARGUMENT','Invalid declarative panel value.');
 if('command'in view)throw new ExtensionError('E_INVALID_ARGUMENT','Panel command bindings require a native command-aware validator.');
 if(view.children!==undefined){if(!Array.isArray(view.children)||view.children.length>200)throw new ExtensionError('E_RESOURCE_LIMIT','Panel tree exceeds budget.');for(const child of view.children)validateView(child,c,depth+1);}
 if(view.options!==undefined&&(!Array.isArray(view.options)||view.options.length>200||view.options.some(v=>typeof v!=='string')))throw new ExtensionError('E_INVALID_ARGUMENT','Invalid panel options.');
}
