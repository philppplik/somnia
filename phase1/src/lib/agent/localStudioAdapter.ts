import {interfaceSession} from '../interface/session';
import {insideInstance} from '../interface/model';
import {animationSession} from '../animation/session';
import {applyEdit} from '../animation/edit';
import {findComp} from '../animation/model';
import {getStudio3DState} from '../studio3d/session';
export type LocalStudioKind='interface'|'animation'|'studio3d';
export interface LocalStudioTarget {kind:LocalStudioKind;identity:unknown;target:string;label:string;before:string;context:string;imageData?:string;imageIdentity?:unknown;vision?:boolean}
export interface LocalStudioProposal {target:LocalStudioTarget;after:string;state:'review'|'accepted'|'undone'|'rejected';acceptedIdentity?:unknown;undo:()=>void;accept:()=>void;reject:()=>void}
const bounded=(text:string,max=4000)=>{if(!text.trim()||text.length>max||text.includes('\0'))throw Error('Invalid suggestion length.');return text.trim();};
const sceneNotes=new WeakMap<object,string>();
export function studioSceneNote(){const s=getStudio3DState();return sceneNotes.get(s.outline as object)??'';}
/** No canvas capture, geometry, original image bytes, paths, URLs or assets in metadata context. */
export function localStudioTarget(kind:LocalStudioKind,vision=false):LocalStudioTarget{
 if(kind==='interface'){
  const s=interfaceSession.get(),d=s.document,n=d?.nodes.find(n=>n.id===s.selection);if(!d||!n||n.locked||insideInstance(d,n.id))throw Error('Choose an unlocked frame or image outside an instance.');
  let parent=n;while(parent.parentId){parent=d.nodes.find(x=>x.id===parent.parentId)!;if(parent.locked)throw Error('Target has a locked parent.');}
  if(n.hidden||vision&&!n.imageFill||!vision&&n.kind!=='frame')throw Error('Choose a frame for metadata description or an image layer for vision.');
  const related=new Set([n.id]);for(let i=0;i<64;i++){const size=related.size;for(const x of d.nodes)if(x.parentId&&related.has(x.parentId))related.add(x.id);if(size===related.size)break;}
  const rows=d.nodes.filter(x=>related.has(x.id)&&!x.hidden).slice(0,60).map(x=>({id:x.id,kind:x.kind,name:x.name.slice(0,200),text:x.text?.slice(0,400),width:x.width,height:x.height}));
  const asset=vision?d.assets?.find(a=>a.id===n.imageFill!.assetId):undefined;
  if(vision&&!asset)throw Error('Image asset is no longer available.');
  return {kind,vision,identity:d,target:n.id,label:n.name,before:String(vision?n.altText??'':n.annotation??''),context:JSON.stringify({task:vision?'Suggest concise alt text for this prepared image.':'Describe this frame from structural metadata only; do not claim to see pixels.',target:n.name,nodes:vision?[]:rows}),...(asset?{imageData:asset.data,imageIdentity:asset}:{} )};
 }
 if(kind==='animation'){
  const s=animationSession().getState(),d=s.doc,layer=d&&findComp(d)?.layers.find(l=>l.id===s.view.selectedLayer);if(!d||!layer||layer.locked||s.preview)throw Error('Select an unlocked animation layer and finish active gestures.');
  return {kind,identity:d,target:layer.id,label:layer.name,before:layer.name,context:JSON.stringify({task:'Suggest one concise layer name, return the name only.',kind:layer.kind,source:{...layer.source,text:layer.source.text?.slice(0,800)},in:layer.inT,out:layer.outT,name:layer.name})};
 }
 const s=getStudio3DState();if(s.status!=='ready')throw Error('Open a ready 3D scene.');
 return {kind,identity:s.outline,target:'scene',label:s.name,before:studioSceneNote(),context:JSON.stringify({task:'Describe scene structure from metadata only. Do not claim to see rendered appearance.',objects:s.outline.slice(0,60).map(n=>({name:n.name.slice(0,200),kind:n.kind,depth:n.depth})),stats:s.stats,bounds:s.bounds,unit:s.unit})};
}
function assertTarget(target:LocalStudioTarget){
 if(target.kind==='interface'){
  const s=interfaceSession.get();if(s.document!==target.identity||s.selection!==target.target)throw Error('Studio target changed. Refresh the suggestion.');
 }else if(target.kind==='animation'){
  const s=animationSession().getState();if(s.doc!==target.identity||s.view.selectedLayer!==target.target||s.preview)throw Error('Studio target changed. Refresh the suggestion.');
 }else if(getStudio3DState().outline!==target.identity||getStudio3DState().status!=='ready')throw Error('Scene changed. Refresh the description.');
}
/** Click-only proposal. No model tools; the typed destination cannot be chosen by model text. */
export function proposeLocalStudio(target:LocalStudioTarget,text:string,vision=false):LocalStudioProposal{
 assertTarget(target);if(vision!==!!target.vision)throw Error('Destination does not match prepared target.');const after=bounded(text,target.kind==='animation'?200:4000);if(after===target.before)throw Error('Suggestion makes no change.');
 const p:LocalStudioProposal={target,after,state:'review',reject(){if(p.state!=='review')throw Error('No pending proposal.');p.state='rejected';},accept(){
  if(p.state!=='review')throw Error('No pending proposal.');assertTarget(target);
  if(target.kind==='interface'){
   // Selection and parent locks are checked again, not inherited from request time.
   localStudioTarget('interface',vision);
   interfaceSession.transact(d=>{const n=d.nodes.find(n=>n.id===target.target)!;if(vision)n.altText=after;else n.annotation=after;});p.acceptedIdentity=interfaceSession.get().document;
  }else if(target.kind==='animation'){
   const session=animationSession();const edit={type:'layer.update' as const,layer:target.target,name:after};applyEdit(session.document!,edit);p.acceptedIdentity=session.dispatch(edit);
  }else{sceneNotes.set(target.identity as object,after);p.acceptedIdentity=after;}
  p.state='accepted';
 },undo(){
  if(p.state!=='accepted')throw Error('No accepted proposal.');
  if(target.kind==='interface'){if(interfaceSession.get().document!==p.acceptedIdentity)throw Error('Later edits exist. Use studio history.');interfaceSession.undo();}
  else if(target.kind==='animation'){if(animationSession().document!==p.acceptedIdentity||animationSession().getState().preview)throw Error('Later edits exist. Use studio history.');animationSession().undo();}
  else {if(getStudio3DState().outline!==target.identity||studioSceneNote()!==after)throw Error('Scene or note changed.');sceneNotes.set(target.identity as object,target.before);}
  p.state='undone';
 }};return p;
}
