import {StudioStatus} from '../studios/StudioStatus';
import {reportError} from '../../lib/log';
import {usePublishPhotosContext} from './panels/publishContext';
import {useCallback,useEffect,useRef,useState} from 'react';
import {AlertTriangle,Bandage,Brush,Contrast,ArrowLeft,ArrowRight,Check,ClipboardPaste,Columns2,Copy,Download,Eye,Frame,Grid3x3,RotateCcw,Undo2,Redo2,X,ZoomIn,ZoomOut,Maximize2,Minimize2,SquareDashed,Circle,Rows2,Ruler} from '../../lib/icons';
import {Button} from '../ui/button';
import {PhotosHandoffBar} from './PhotosHandoffBar';
import {NativeInput} from '../ui/native-controls';
import {useT} from '../../lib/useT';
import {applyPhotoCrop,cancelPhotoCrop,dirtyPhoto,exportPhotoCopy,historyPhoto,openPhoto,resetPhoto,rotatePhoto,setPhotoCropping,setPhotoCropDraft,usePhotoSession,type PhotoFrame,renderPhotoBytes} from '../../lib/photos/studioSession';
import {autoSource,clampSpot} from '../../lib/photos/healSpots';
import {PHOTO_LABELS} from '../../lib/photos/labels';
import {cullBatch,cullSetRating,cullSetFlag,cullSetLabel,undoCull,redoCull} from '../../lib/photos/cullHistory';
import {deriveSpotWhiteBalance} from '../../lib/photos/autoTone';
import {clampGrad,MAX_GRADS,type GradFilter,clampRad,MAX_RADS,type RadFilter} from '../../lib/photos/localAdjust';
import {MAX_BRUSH_STROKES,MAX_BRUSH_TOTAL_DABS,brushTotalDabs,type BrushStroke} from '../../lib/photos/brushStrokes';
import {clampDab} from '../../lib/photos/localAdjust';
import type {PhotoCrop} from '../../lib/photos/studioSettings';
import {CROP_GUIDE_STYLES,cropGuideLines,type CropGuideStyle} from '../../lib/photos/cropGuides';
import {clippingOverlayImage} from '../../lib/photos/clippingOverlay';
import {clampSplitX,splitClearRect} from '../../lib/photos/splitView';
import {decodeSettingsPayload,encodeSettingsPayload,settingsPayloadToText,type SettingsPayload} from '../../lib/photos/settingsClipboard';
import {developablePhotos,photoNav} from '../../lib/photos/photoNav';
import {ZOOM_PRESETS,isZoomPresetActive,zoomPresetLabel} from '../../lib/photos/zoomPresets';
import {setActiveMedia,useMedia} from '../../lib/media';
import {PhotosFilmstrip} from './PhotosFilmstrip';
import {PhotosSurvey} from './PhotosSurvey';
import {PhotosShortcutsDialog} from './PhotosShortcutsDialog';
import {beginPhotoGesture,endPhotoGesture,previewPhotoSettings,commitPhotoSettings} from '../../lib/photos/studioSession';
import {bandForHue,nearestCurvePoint,targetCurveDelta,targetSliderDelta} from '../../lib/photos/targeting';
import {sanitizeCurvePoints,type CurveChannel} from '../../lib/photos/curves';
import {NEUTRAL_BAND,rgbToHsl,type HslBandId} from '../../lib/photos/hslMixer';
import {lumMaskWeight,lumMaskWindowNeutral,neutralLumMask} from '../../lib/photos/lumMask';
import {straightenAngle} from '../../lib/photos/straightenDrag';
import {lumaOf} from '../../lib/photos/histogram';
import {panelStateStore,usePanelState} from '../../store/panelStateStore';
import {getState,patchState,requestStudio,useAppStore} from '../../store/appStore';
import type {MediaItem} from '../../lib/media';
const bar='media-bar flex flex-wrap items-center gap-2 border-b border-subtle px-3 py-1.5 text-[12px]'; // wraps to a second row instead of squeezing controls away
const MIN_CROP=0.05;
const MAX_ZOOM=16;
function draw(canvas:HTMLCanvasElement|null,frame:PhotoFrame|null){
 if(!canvas)return;
 if(!frame){canvas.width=1;canvas.height=1;return;}
 canvas.width=frame.width;canvas.height=frame.height;
 canvas.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(frame.bytes),frame.width,frame.height),0,0);
}
/** RGB of the rendered frame at normalized image coords, null outside. */
function pixelAt(frame:PhotoFrame,nx:number,ny:number):[number,number,number]|null{
 if(nx<0||nx>1||ny<0||ny>1)return null;
 const x=Math.min(frame.width-1,Math.max(0,Math.round(nx*(frame.width-1)))),y=Math.min(frame.height-1,Math.max(0,Math.round(ny*(frame.height-1))));
 const o=(y*frame.width+x)*4,px=new Uint8Array(frame.bytes);
 return[px[o],px[o+1],px[o+2]];
}
const clampCrop=(r:PhotoCrop):PhotoCrop=>{
 const w=Math.max(MIN_CROP,r.x1-r.x0),h=Math.max(MIN_CROP,r.y1-r.y0);
 const x0=Math.min(Math.max(0,r.x0),1-w),y0=Math.min(Math.max(0,r.y0),1-h);
 return{x0,y0,x1:Math.min(1,x0+w),y1:Math.min(1,y0+h)};
};
type DragMode={kind:'move';dx:number;dy:number}|{kind:'nw'|'ne'|'sw'|'se'};
/** The developed photo with zoom/pan, crop overlay, compare, undo and bounded copy export. */
export function PhotosWorkspace({item}:{item:MediaItem}){
 const {t}=useT();const studio=useAppStore().activeStudio;const session=usePhotoSession(item.name);
 const media=useMedia();const nav=photoNav(media.items,item.name);
 const stage=useRef<HTMLDivElement>(null),canvas=useRef<HTMLCanvasElement>(null),clipCanvas=useRef<HTMLCanvasElement>(null),splitCanvas=useRef<HTMLCanvasElement>(null),maskCanvas=useRef<HTMLCanvasElement>(null),imgBox=useRef<HTMLDivElement>(null);
 const [stageSize,setStageSize]=useState<[number,number]>([0,0]);
 const [zoom,setZoom]=useState<number|null>(null); // null = fit
 const [pan,setPan]=useState<[number,number]>([0,0]);
 const [compare,setCompare]=useState(false);
 const [survey,setSurvey]=useState(false);
 const [surveyNames,setSurveyNames]=useState<string[]>([]);
 const [note,setNote]=useState('');
 const [showGuides,setShowGuides]=usePanelState<boolean>('photos.cropGuides',true);
 const [guideStyle,setGuideStyle]=usePanelState<CropGuideStyle>('photos.cropGuideStyle','thirds');
 const [lightsOut,setLightsOut]=usePanelState<boolean>('photos.lightsOut',false);
 const [showClipping,setShowClipping]=usePanelState<boolean>('photos.clipping',false);
 const [showMaskOverlay]=usePanelState<boolean>('photos.lummask.overlay',false);
 const [showSplit,setShowSplit]=usePanelState<boolean>('photos.split',false);
 const [settingsClip,setSettingsClip]=usePanelState<SettingsPayload|null>('photos.settingsClipboard',null);
 const clipboardSettings=decodeSettingsPayload(settingsClip);
 const [splitX,setSplitX]=usePanelState<number>('photos.splitX',0.5); // divider position survives reloads, like the split toggle itself
 const [splitDir,setSplitDir]=usePanelState<'vertical'|'horizontal'>('photos.splitDir','vertical');
 const splitDrag=useRef(false);
 const [healing,setHealing]=useState(false);
 const [brushR,setBrushR]=usePanelState<number>('photos.healRadius',0.03);
 const [healMode,setHealMode]=usePanelState<boolean>('photos.healMode',false);
 const [radInvert,setRadInvert]=usePanelState<boolean>('photos.radInvert',false);
 const [healCursor,setHealCursor]=useState<{x:number;y:number}|null>(null);
 const [rgbPos,setRgbPos]=useState<{x:number;y:number}|null>(null); // stage hover position for the RGB readout
 const healStart=useRef<{x:number;y:number}|null>(null);
 const [dodging,setDodging]=useState(false);
 const [grading,setGrading]=useState(false);
 const gradDraft=useRef<GradFilter|null>(null); // in-flight graduated filter drag
 const [radial,setRadial]=useState(false);
 const [brushing,setBrushing]=useState(false);
 const [straightening,setStraightening]=useState(false);
 const straightDraft=useRef<{x0:number;y0:number;x1:number;y1:number}|null>(null);
 const [brushStrokeR,setBrushStrokeR]=usePanelState<number>('photos.brushRadius',0.05);
 const [brushEV,setBrushEV]=usePanelState<number>('photos.brushEV',0.5);
 const [brushTemp,setBrushTemp]=usePanelState<number>('photos.brushTemp',0);
 const [brushSat,setBrushSat]=usePanelState<number>('photos.brushSat',0);
 const brushChain=useRef<{x:number;y:number;r:number}[]|null>(null); // dabs of the in-flight brush stroke
 const [curvesTarget,setCurvesTarget]=usePanelState<boolean>('photos.curves.target',false);
 const [hslTarget,setHslTarget]=usePanelState<boolean>('photos.hsl.target',false);
 const [wbPicker,setWbPicker]=usePanelState<boolean>('photos.wb.picker',false);
 const [curveChannel]=usePanelState<CurveChannel>('photos.curves','master');
 const [,setTargetBand]=usePanelState<string>('photos.hsl','red');
 const targetArmed=(curvesTarget||hslTarget||wbPicker)&&!healing&&!dodging&&!grading&&!radial&&!brushing; // tool modes win over the target tool
 const targetDrag=useRef<{startY:number;trackPx:number}|null>(null);
 const targetIndex=useRef<number|null>(null);   // grabbed curve point (index in the sanitized array)
 const targetBase=useRef<number|null>(null);    // its y, or the band's saturation at drag start
 const targetBandRef=useRef<HslBandId|null>(null);
 const radDraft=useRef<{x0:number;y0:number;x1:number;y1:number}|null>(null); // in-flight radial filter drag (bounding box)
 useEffect(()=>{ // Escape disarms the target tool, the split view and the horizon drag from anywhere
  if(!curvesTarget&&!hslTarget&&!wbPicker&&!showSplit&&!brushing&&!straightening&&!session?.cropping&&!survey)return;
  const onKey=(e:KeyboardEvent)=>{if(e.key==='Escape'){setCurvesTarget(false);setHslTarget(false);setWbPicker(false);setShowSplit(false);setBrushing(false);setStraightening(false);straightDraft.current=null;if(session?.cropping)cancelPhotoCrop(item.name);setSurvey(false);}};
  window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey);
 },[curvesTarget,hslTarget,wbPicker,showSplit,brushing,straightening,session?.cropping,item.name,setCurvesTarget,setHslTarget,setWbPicker,setShowSplit,survey]);

 const [dabR,setDabR]=usePanelState<number>('photos.dodgeRadius',0.05);
 const dabChain=useRef<{x:number;y:number;r:number}[]|null>(null); // dabs of the in-flight dodge stroke
 const healPath=useRef<{x:number;y:number}[]|null>(null); // path points of the in-flight heal stroke
 const drag=useRef<{pan?:{x:number;y:number;px:number;py:number};crop?:DragMode}|null>(null);
 useEffect(()=>{void openPhoto(item);},[item]);
 usePublishPhotosContext(item.name);
 // Opening a photo takes you to the Photos Studio unless you picked a studio yourself.
 useEffect(()=>{if(studio!=='photos')requestStudio('photos','automatic');},[studio]);
 // The Photos rail offers Files only, so do not leave the HTML Layers tree open beside a photo.
 useEffect(()=>{if(studio==='photos'&&!['files','search'].includes(getState().leftTab))patchState({leftTab:'files'});},[studio]);
 useEffect(()=>{const el=stage.current;if(!el)return;const ro=new ResizeObserver(()=>setStageSize([el.clientWidth,el.clientHeight]));ro.observe(el);setStageSize([el.clientWidth,el.clientHeight]);return()=>ro.disconnect();},[]);
 const shown=compare&&session?.original?session.original:session?.frame??null;
 useEffect(()=>{draw(canvas.current,shown);},[shown]);
 useEffect(()=>{if(showClipping)draw(clipCanvas.current,shown?clippingOverlayImage(shown):null);},[shown,showClipping]);
 const lumMask=session?.now.lumMask??neutralLumMask();
 useEffect(()=>{ // the mask overlay paints the weight map over the current frame, accent-tinted
  const c=maskCanvas.current;
  if(!showMaskOverlay||!shown||lumMaskWindowNeutral(lumMask)){draw(c,null);return;}
  const px=new Uint8Array(shown.bytes),img=new ImageData(shown.width,shown.height);
  for(let p=0;p<shown.width*shown.height;p++){
   const i=p*4,r=px[i],g=px[i+1],b=px[i+2];
   const [hh,ss]=rgbToHsl(r,g,b);
   const w=lumMaskWeight((0.2126*r+0.7152*g+0.0722*b)/255,hh,ss,lumMask);
   img.data[i]=99;img.data[i+1]=102;img.data[i+2]=241;img.data[i+3]=Math.round(w*110);
  }
  if(c){c.width=shown.width;c.height=shown.height;c.getContext('2d')!.putImageData(img,0,0);}
 },[shown,showMaskOverlay,lumMask]);
 const original=session?.original;
 useEffect(()=>{
  if(!showSplit)return;
  const c=splitCanvas.current;draw(c,original??null);
  if(c&&original){const r=splitClearRect(original.width,original.height,splitX,splitDir);c.getContext('2d')!.clearRect(r.x,r.y,r.width,r.height);}
 },[original,showSplit,splitX,splitDir]);
 const fw=shown?.width??1,fh=shown?.height??1;
 const fit=stageSize[0]>0&&stageSize[1]>0?Math.min(stageSize[0]/fw,stageSize[1]/fh):1;
 const scale=zoom??fit;
 const dispW=fw*scale,dispH=fh*scale;
 const clampPan=useCallback((x:number,y:number,s:number):[number,number]=>{
  const mx=Math.max(0,(fw*s-stageSize[0])/2)+80,my=Math.max(0,(fh*s-stageSize[1])/2)+80;
  return[Math.min(mx,Math.max(-mx,x)),Math.min(my,Math.max(-my,y))];
 },[fw,fh,stageSize]);
 const zoomTo=useCallback((next:number,px=0,py=0)=>{
  setZoom(prev=>{
   const cur=prev??fit;const s=Math.min(MAX_ZOOM,Math.max(0.02,next));
   const k=s/cur;setPan(([x,y])=>clampPan(px-(px-x)*k,py-(py-y)*k,s));
   return s;
  });
 },[fit,clampPan]);
 const onWheel=useCallback((e:React.WheelEvent)=>{
  e.preventDefault();const rect=stage.current!.getBoundingClientRect();
  zoomTo((zoom??fit)*(e.deltaY<0?1.2:1/1.2),e.clientX-rect.left-rect.width/2,e.clientY-rect.top-rect.height/2);
 },[zoom,fit,zoomTo]);
 /** Rating/flag keys act on the filmstrip selection when more than one photo is selected, otherwise on the active photo. */
 const cullTargets=(active:string):string[]=>{const sel=panelStateStore.get<string[]>('photos.filmstripSelection',[]);return sel.length>1?sel:[active];};
 /** Lightroom-style auto advance: after a rating/flag key on the active photo (not a multi-selection), move to the next one. */
 const maybeAdvance=(active:string,targets:string[])=>{if(targets.length===1&&targets[0]===active&&panelStateStore.get<boolean>('photos.autoAdvance',false)&&nav.next)setActiveMedia(nav.next);};
 useEffect(()=>{ // arrows walk the library like the prev/next buttons, digits 0-5 rate the active photo; editable targets and modifiers keep their keys
  const onKey=(e:KeyboardEvent)=>{
   if((e.ctrlKey||e.metaKey)&&!e.altKey&&!e.shiftKey&&(e.key==='z'||e.key==='Z')){ // culling undo; editable targets keep native text undo
    const el=e.target as HTMLElement|null;
    if(!(el&&el.closest('input,select,textarea,[contenteditable="true"]'))){if(undoCull())e.preventDefault();}
    return;
   }
   if((e.ctrlKey||e.metaKey)&&!e.altKey&&((e.shiftKey&&(e.key==='Z'||e.key==='z'))||e.key==='y'||e.key==='Y')){ // culling redo
    const el=e.target as HTMLElement|null;
    if(!(el&&el.closest('input,select,textarea,[contenteditable="true"]'))){if(redoCull())e.preventDefault();}
    return;
   }
   if(e.metaKey||e.ctrlKey||e.altKey)return;
   const el=e.target as HTMLElement|null;
   if(el&&el.closest('input,select,textarea,[contenteditable="true"]'))return;
   if(e.key==='Enter'&&session?.cropping){e.preventDefault();applyPhotoCrop(item.name);return;} // Enter commits the crop like the apply button
   if(e.key==='Home'||e.key==='End'){ // first/last developable photo in library order
    const all=developablePhotos(media.items);
    const target=e.key==='Home'?all[0]:all[all.length-1];
    if(target&&target.name!==item.name){e.preventDefault();setActiveMedia(target.name);}
    return;
   }
   if(e.key==='ArrowLeft'&&nav.prev){e.preventDefault();setActiveMedia(nav.prev);}
   else if(e.key==='ArrowRight'&&nav.next){e.preventDefault();setActiveMedia(nav.next);}
   else if(/^[0-5]$/.test(e.key)){const t=cullTargets(item.name);cullBatch(()=>{for(const n of t)cullSetRating(n,Number(e.key));});maybeAdvance(item.name,t);}
   else if(e.key==='p'||e.key==='P'){const t=cullTargets(item.name);cullBatch(()=>{for(const n of t)cullSetFlag(n,'pick');});maybeAdvance(item.name,t);}
   else if(e.key==='x'||e.key==='X'){const t=cullTargets(item.name);cullBatch(()=>{for(const n of t)cullSetFlag(n,'reject');});maybeAdvance(item.name,t);}
   else if(e.key==='u'||e.key==='U'){const t=cullTargets(item.name);cullBatch(()=>{for(const n of t)cullSetFlag(n,null);});maybeAdvance(item.name,t);}
   else if(/^[6-9]$/.test(e.key)){const t=cullTargets(item.name);const l=PHOTO_LABELS[Number(e.key)-6];cullBatch(()=>{for(const n of t)cullSetLabel(n,l);});maybeAdvance(item.name,t);} // 6-9: red/yellow/green/blue, like Lightroom
   else if(e.key==='o'||e.key==='O')setGuideStyle(CROP_GUIDE_STYLES[(CROP_GUIDE_STYLES.indexOf(guideStyle)+1)%CROP_GUIDE_STYLES.length]);
   else if(e.key==='z'||e.key==='Z'){if(zoom===null){setZoom(1);setPan([0,0]);}else{setZoom(null);setPan([0,0]);}} // same states as the fit/actual buttons
   else if(e.key==='\\'&&!e.repeat)setCompare(true); // hold to peek at the original, like the compare button
   else if(e.key==='l'||e.key==='L')setLightsOut(!lightsOut);
   else if(e.key==='[')rotatePhoto(item.name,-1);
   else if(e.key===']')rotatePhoto(item.name,1);
   else if(e.key==='?')panelStateStore.set('photos.shortcuts',!panelStateStore.get('photos.shortcuts',false));
   else if(e.key==='+'||e.key==='=')zoomTo(scale*1.25);
   else if(e.key==='-'||e.key==='_')zoomTo(scale/1.25);
  };
  const onKeyUp=(e:KeyboardEvent)=>{if(e.key==='\\')setCompare(false);};
  window.addEventListener('keydown',onKey);window.addEventListener('keyup',onKeyUp);
  return()=>{window.removeEventListener('keydown',onKey);window.removeEventListener('keyup',onKeyUp);};
 },[nav.prev,nav.next,item.name,media.items,session?.cropping,guideStyle,setGuideStyle,lightsOut,setLightsOut,zoom,scale,zoomTo]);

 const pointerPos=(e:React.PointerEvent)=>{const r=imgBox.current!.getBoundingClientRect();return{x:(e.clientX-r.left)/r.width,y:(e.clientY-r.top)/r.height};};
 const onStageDown=(e:React.PointerEvent)=>{
  if(session?.cropping)return; // in crop mode only the overlay handles drag
  (e.target as HTMLElement).setPointerCapture(e.pointerId);
  if(healing){const p=pointerPos(e);healStart.current=p;healPath.current=[p];return;} // heal mode never pans
  if(dodging){const p=pointerPos(e);healStart.current=p;dabChain.current=[{x:p.x,y:p.y,r:dabR}];return;} // dodge/burn paints on release
  if(brushing){const p=pointerPos(e);healStart.current=p;brushChain.current=[{x:p.x,y:p.y,r:brushStrokeR}];return;} // brush paints on release, values freeze then
  if(grading){const p=pointerPos(e);gradDraft.current={x0:p.x,y0:p.y,x1:p.x,y1:p.y};return;} // graduated filter defines its ramp on release
  if(radial){const p=pointerPos(e);radDraft.current={x0:p.x,y0:p.y,x1:p.x,y1:p.y};return;} // radial filter defines its bounding box on release
  if(straightening){const p=pointerPos(e);straightDraft.current={x0:p.x,y0:p.y,x1:p.x,y1:p.y};return;} // horizon line commits its angle on release
  if(wbPicker)return; // the white-balance picker acts on pointer up, nothing to track on press
  if(targetArmed&&shown){ // targeted adjustment: the photo itself is the slider
   const p=pointerPos(e);const track=imgBox.current!.getBoundingClientRect().height;
   const px=pixelAt(shown,p.x,p.y);if(!px)return;
   beginPhotoGesture(item.name);
   targetDrag.current={startY:e.clientY,trackPx:track};
   if(curvesTarget){ // grab or add the curve point at this tone, then vertical drag shapes it
    const tone=Math.min(0.99,Math.max(0.01,lumaOf(px[0],px[1],px[2])/255));
    const pts=sanitizeCurvePoints(session?.now.curves?.[curveChannel]??[]);
    let i=nearestCurvePoint(pts,tone);let arr=pts;
    if(i<0){arr=sanitizeCurvePoints([...pts,{x:tone,y:tone}]);i=arr.findIndex(q=>Math.abs(q.x-tone)<5e-4);
     previewPhotoSettings(item.name,now=>({...now,curves:{...now.curves,[curveChannel]:arr}}));}
    targetIndex.current=i;targetBase.current=arr[i]?.y??tone;
   }else{ // mixer: the pixel's hue picks the band, vertical drag sets its saturation
    const band=bandForHue(rgbToHsl(px[0],px[1],px[2])[0]);
    setTargetBand(band);targetBandRef.current=band;
    targetBase.current=session?.now.hsl?.[band]?.sat??0;
   }
   return;
  }
  drag.current={pan:{x:pan[0],y:pan[1],px:e.clientX,py:e.clientY}};
 };
 const onStageMove=(e:React.PointerEvent)=>{
  setRgbPos(pointerPos(e)); // the readout follows every hover
  if(brushing&&brushChain.current){const p=pointerPos(e);const last=brushChain.current[brushChain.current.length-1];const fw2=session?.frame?.width??1,fh2=session?.frame?.height??1;
   if(Math.hypot((p.x-last.x)*fw2,(p.y-last.y)*fh2)/Math.min(fw2,fh2)>=brushStrokeR/2)brushChain.current.push({x:p.x,y:p.y,r:brushStrokeR});}
  if(straightening&&straightDraft.current){const p=pointerPos(e);straightDraft.current={...straightDraft.current,x1:p.x,y1:p.y};setHealCursor(p);}
  if(healing||dodging||grading||radial||brushing){
   const p=pointerPos(e);setHealCursor(p);
   if(shown){
    if(dodging&&dabChain.current){ // extend the stroke every half radius (distance in short-side units)
     const last=dabChain.current[dabChain.current.length-1];
     if(Math.hypot((p.x-last.x)*fw,(p.y-last.y)*fh)/Math.min(fw,fh)>=dabR/2)dabChain.current.push({x:p.x,y:p.y,r:dabR});
    }
    if(grading&&gradDraft.current)gradDraft.current={...gradDraft.current,x1:p.x,y1:p.y};
    if(radial&&radDraft.current)radDraft.current={...radDraft.current,x1:p.x,y1:p.y};
    if(healing&&healPath.current){ // same chaining for a heal stroke; the source offset is fixed on release
     const last=healPath.current[healPath.current.length-1];
     if(Math.hypot((p.x-last.x)*fw,(p.y-last.y)*fh)/Math.min(fw,fh)>=brushR/2)healPath.current.push(p);
    }
   }
   return;
  }
  if(targetDrag.current){
   const dy=e.clientY-targetDrag.current.startY;
   if(curvesTarget){ // adjust the grabbed curve point's y live
    previewPhotoSettings(item.name,now=>{
     const pts=sanitizeCurvePoints(now.curves?.[curveChannel]??[]);
     const i=targetIndex.current;if(i==null||i>=pts.length)return now;
     const base=targetBase.current??pts[i].y;
     const next=pts.slice();next[i]={x:pts[i].x,y:Math.min(1,Math.max(0,base+targetCurveDelta(dy,targetDrag.current!.trackPx)))};
     return{...now,curves:{...now.curves,[curveChannel]:next}};});
   }else{
    previewPhotoSettings(item.name,now=>{
     const b=targetBandRef.current;if(!b)return now;
     const cur=now.hsl?.[b]??NEUTRAL_BAND;const base=targetBase.current??cur.sat;
     return{...now,hsl:{...now.hsl,[b]:{...cur,sat:Math.min(100,Math.max(-100,Math.round(base+targetSliderDelta(dy,targetDrag.current!.trackPx))))}}};});
   }
   return;
  }
  const d=drag.current;if(!d?.pan)return;
  setPan(clampPan(d.pan.x+(e.clientX-d.pan.px),d.pan.y+(e.clientY-d.pan.py),scale));
 };
 const onStageUp=(e:React.PointerEvent)=>{
  if(wbPicker){ // one click = one white-balance pick = one atomic commit = one undo step; the picker disarms after use
   setWbPicker(false);
   const p=pointerPos(e),f=session?.frame;
   if(f){
    const pick=deriveSpotWhiteBalance(new Uint8Array(f.bytes.slice(0)),f.width,f.height,Math.round(p.x*f.width),Math.round(p.y*f.height));
    if(pick)commitPhotoSettings(item.name,now=>({...now,...pick}));
   }
   return;
  }
  if(straightDraft.current){ // one horizon drag = one commit = one undo step
   const d=straightDraft.current;straightDraft.current=null;
   const angle=straightenAngle(d.x0,d.y0,d.x1,d.y1);
   if(angle!==null)commitPhotoSettings(item.name,now=>({...now,straighten:angle}));
   return;
  }
  if(gradDraft.current){ // one drag = one filter = one commit = one undo step, capped to the filter budget
   const g=clampGrad(gradDraft.current);gradDraft.current=null;
   commitPhotoSettings(item.name,now=>{const room=Math.max(0,MAX_GRADS-now.grads.length);return room?{...now,grads:[...now.grads,g]}:now;});
   return;
  }
  if(radDraft.current){ // the bounding box becomes an ellipse; one drag = one filter = one commit = one undo step
   const d=radDraft.current;radDraft.current=null;
   const r=clampRad({x:(d.x0+d.x1)/2,y:(d.y0+d.y1)/2,rx:Math.abs(d.x1-d.x0)/2,ry:Math.abs(d.y1-d.y0)/2,...(radInvert?{invert:true}:{})});
   commitPhotoSettings(item.name,now=>{const room=Math.max(0,MAX_RADS-now.rads.length);return room?{...now,rads:[...now.rads,r]}:now;});
   return;
  }
  if(healStart.current){ // heal: drag = stroke chain toward the release point, click = auto source; dodge: a stroke of dabs
   const start=healStart.current;healStart.current=null;
   const end=pointerPos(e);
   if(dodging){ // one stroke = one commit = one undo step, capped to the dab budget
    const chain=dabChain.current??[{x:start.x,y:start.y,r:dabR}];dabChain.current=null;
    commitPhotoSettings(item.name,now=>{const room=Math.max(0,200-now.dabs.length);return room?{...now,dabs:[...now.dabs,...chain.slice(0,room).map(clampDab)]}:now;});
    return;
   }
   if(brushing){ // one stroke = one commit = one undo step; ev/temp/sat freeze into the stroke
    const chain=brushChain.current??[{x:start.x,y:start.y,r:brushStrokeR}];brushChain.current=null;
    const stroke:BrushStroke={dabs:chain.map(clampDab),ev:brushEV,temp:brushTemp,sat:brushSat};
    commitPhotoSettings(item.name,now=>{
     if(now.brushes.length>=MAX_BRUSH_STROKES)return now;
     const room=Math.max(0,MAX_BRUSH_TOTAL_DABS-brushTotalDabs(now.brushes));if(!room)return now;
     return{...now,brushes:[...now.brushes,{...stroke,dabs:stroke.dabs.slice(0,room)}]};
    });
    return;
   }
   const path=healPath.current??[start];healPath.current=null;
   if(Math.hypot(end.x-start.x,end.y-start.y)>0.01){ // paint over the defect, release on a clean area: every path point heals from that one offset
    const dx=end.x-start.x,dy=end.y-start.y;
    const mode=healMode?'heal' as const:'clone' as const;
    commitPhotoSettings(item.name,now=>{const room=Math.max(0,200-now.spots.length);return room?{...now,spots:[...now.spots,...path.slice(0,room).map(pt=>clampSpot({x:pt.x,y:pt.y,r:brushR,dx,dy,mode}))]}:now;});
   }else if(shown){ // a plain click auto-picks the flattest nearby source disc
    const sp=autoSource(shown,start.x,start.y,brushR);
    if(sp)commitPhotoSettings(item.name,now=>({...now,spots:[...now.spots,clampSpot({...sp,mode:healMode?'heal':'clone'})]}));
   }
   return;
  }
  if(targetDrag.current){targetDrag.current=null;targetIndex.current=null;targetBase.current=null;targetBandRef.current=null;endPhotoGesture(item.name);return;} // one drag = one undo step
  if(drag.current?.pan)drag.current=null;
 };
 const removeDab=(i:number)=>commitPhotoSettings(item.name,now=>({...now,dabs:now.dabs.filter((_,j)=>j!==i)})); // one commit = one undo step
 const removeSpot=(i:number)=>commitPhotoSettings(item.name,now=>({...now,spots:now.spots.filter((_,j)=>j!==i)}));
 const removeGrad=(i:number)=>commitPhotoSettings(item.name,now=>({...now,grads:now.grads.filter((_,j)=>j!==i)}));
 const removeRad=(i:number)=>commitPhotoSettings(item.name,now=>({...now,rads:now.rads.filter((_,j)=>j!==i)}));
 const removeBrush=(i:number)=>commitPhotoSettings(item.name,now=>({...now,brushes:now.brushes.filter((_,j)=>j!==i)})); // one commit = one undo step
 const markerProps=(i:number,kind:'dab'|'spot'|'grad'|'rad'|'brush')=>({pointerEvents:'all' as const,cursor:'pointer',role:'button','aria-label':t('photos.overlay.remove'),'data-testid':`photos-${kind==='dab'?'mask':kind==='spot'?'heal':kind}-marker-${i}`,onPointerDown:(e:React.PointerEvent)=>e.stopPropagation(),onPointerUp:(e:React.PointerEvent)=>e.stopPropagation(),onClick:(e:React.MouseEvent)=>{e.stopPropagation();if(kind==='dab')removeDab(i);else if(kind==='spot')removeSpot(i);else if(kind==='grad')removeGrad(i);else if(kind==='brush')removeBrush(i);else removeRad(i);}});
 const startCropDrag=(mode:DragMode)=>(e:React.PointerEvent)=>{
  e.stopPropagation();(e.target as HTMLElement).setPointerCapture(e.pointerId);
  if(mode.kind==='move'){const p=pointerPos(e);const d=session!.cropDraft!;drag.current={crop:{kind:'move',dx:p.x-d.x0,dy:p.y-d.y0}};}
  else drag.current={crop:mode};
 };
 const onCropMove=(e:React.PointerEvent)=>{
  const d=drag.current?.crop,s=session;if(!d||!s?.cropDraft)return;
  const p=pointerPos(e),r=s.cropDraft;
  let next:PhotoCrop;
  if(d.kind==='move')next=clampCrop({x0:p.x-d.dx,y0:p.y-d.dy,x1:p.x-d.dx+(r.x1-r.x0),y1:p.y-d.dy+(r.y1-r.y0)});
  else{
   const x0=d.kind==='nw'||d.kind==='sw'?Math.min(p.x,r.x1-MIN_CROP):r.x0;
   const x1=d.kind==='ne'||d.kind==='se'?Math.max(p.x,r.x0+MIN_CROP):r.x1;
   const y0=d.kind==='nw'||d.kind==='ne'?Math.min(p.y,r.y1-MIN_CROP):r.y0;
   const y1=d.kind==='sw'||d.kind==='se'?Math.max(p.y,r.y0+MIN_CROP):r.y1;
   next=clampCrop({x0:Math.max(0,x0),y0:Math.max(0,y0),x1:Math.min(1,x1),y1:Math.min(1,y1)});
  }
  setPhotoCropDraft(item.name,next);
 };
 const onCropUp=()=>{if(drag.current?.crop)drag.current=null;};
 const doExport=async(format:'png'|'jpeg')=>{setNote('');try{const r=await exportPhotoCopy(item.name,format);if(r==='saved')setNote(t('photos.saved'));}catch(e){reportError('photos.operation',e,{context:{studio:'photos'}});setNote(t('photos.saveFailed',{message:e instanceof Error?e.message:String(e)}));}};
 const status=!session||session.status==='loading'?t('photos.loading'):session.status==='processing'?t('photos.processing'):session.status==='error'?t('photos.error',{message:session.error}):'';
 const ready=session?.status==='ready'||session?.status==='processing';
 const dirty=session?dirtyPhoto(session):false;
 const crop=session?.cropDraft;
 const guideLines=crop?cropGuideLines(crop,guideStyle):null;
 return <section className={`canvas-stage relative flex min-h-0 w-full flex-1 flex-col${lightsOut?' photos-lights-out':''}`} aria-label={t('photos.title')} data-testid="photos-workspace">
  <div className={bar}>
   <span className="truncate font-medium text-ink" data-testid="photos-name">{item.name}</span>
   <span className="text-ink-3" data-testid="photos-info">{session?.sourceWidth?t('photos.info',{width:session.sourceWidth,height:session.sourceHeight}):''}</span>
   {nav.total>1&&<span className="flex items-center gap-1" data-testid="photos-nav">
    <Button size="icon" variant="outline" aria-label={t('photos.nav.prev')} title={t('photos.nav.prev')} disabled={!nav.prev} onClick={()=>nav.prev&&setActiveMedia(nav.prev)} data-testid="photos-prev"><ArrowLeft size={14}/></Button>
    <span className="min-w-8 text-center tabular-nums text-ink-3" data-testid="photos-position">{nav.position} / {nav.total}</span>
    <Button size="icon" variant="outline" aria-label={t('photos.nav.next')} title={t('photos.nav.next')} disabled={!nav.next} onClick={()=>nav.next&&setActiveMedia(nav.next)} data-testid="photos-next"><ArrowRight size={14}/></Button>
   </span>}
   <span className="flex-1"/>
   <Button size="icon" variant="outline" aria-label={t('photos.compare')} title={t('photos.compare')} disabled={!session?.original} onPointerDown={()=>setCompare(true)} onPointerUp={()=>setCompare(false)} onPointerLeave={()=>setCompare(false)} data-testid="photos-compare"><Eye size={14}/></Button>
   <Button size="icon" variant="outline" aria-pressed={showClipping} aria-label={t('photos.clipping')} title={t('photos.clipping')} disabled={!ready} onClick={()=>setShowClipping(!showClipping)} data-testid="photos-clipping"><AlertTriangle size={14}/></Button>
   <Button size="icon" variant="outline" aria-pressed={showSplit} aria-label={t('photos.split')} title={t('photos.split')} disabled={!session?.original} onClick={()=>setShowSplit(!showSplit)} data-testid="photos-split"><Columns2 size={14}/></Button>
   {showSplit&&<Button size="icon" variant="outline" aria-pressed={splitDir==='horizontal'} aria-label={t('photos.split.dir')} title={t('photos.split.dir')} onClick={()=>setSplitDir(splitDir==='vertical'?'horizontal':'vertical')} data-testid="photos-split-dir"><Rows2 size={14}/></Button>}
   <Button size="icon" variant="outline" aria-label={t('photos.undo')} disabled={!session?.past.length} onClick={()=>historyPhoto(item.name,false)} data-testid="photos-undo"><Undo2 size={14}/></Button>
   <Button size="icon" variant="outline" aria-label={t('photos.redo')} disabled={!session?.future.length} onClick={()=>historyPhoto(item.name,true)} data-testid="photos-redo"><Redo2 size={14}/></Button>
   <Button size="icon" variant="outline" aria-label={t('photos.reset')} disabled={!ready} onClick={()=>resetPhoto(item.name)} data-testid="photos-reset"><RotateCcw size={14}/></Button>
   <Button size="icon" variant="outline" aria-label={t('photos.settings.copy')} title={t('photos.settings.copy')} disabled={!ready} onClick={()=>{
    if(!session)return;const p=encodeSettingsPayload(session.now);setSettingsClip(p);setNote(t('photos.settings.copied'));
    try{void navigator.clipboard?.writeText(settingsPayloadToText(p));}catch{/* in-app payload is the source of truth */}
   }} data-testid="photos-settings-copy"><Copy size={14}/></Button>
   <Button size="icon" variant="outline" aria-label={t('photos.settings.paste')} title={t('photos.settings.paste')} disabled={!ready||!clipboardSettings} onClick={()=>{
    if(!clipboardSettings)return;commitPhotoSettings(item.name,()=>clipboardSettings);setNote(t('photos.settings.pasted'));
   }} data-testid="photos-settings-paste"><ClipboardPaste size={14}/></Button>
   <Button size="compact" variant="outline" aria-pressed={!!session?.cropping} disabled={!ready} onClick={()=>setPhotoCropping(item.name,!session?.cropping)} data-testid="photos-crop"><Frame size={13}/>{t('photos.crop')}</Button>
   {session?.cropping&&<>
    <Button size="icon" variant="outline" aria-pressed={showGuides} aria-label={t('photos.crop.guides')} title={`${t('photos.crop.guides')}: ${t(`photos.crop.guide.${guideStyle}`)}`} onClick={()=>setShowGuides(!showGuides)} data-testid="photos-crop-guides"><Grid3x3 size={14}/></Button>
    <Button size="compact" variant="primary" onClick={()=>applyPhotoCrop(item.name)} data-testid="photos-crop-apply"><Check size={13}/>{t('photos.crop.apply')}</Button>
    <Button size="compact" variant="outline" onClick={()=>cancelPhotoCrop(item.name)} data-testid="photos-crop-cancel"><X size={13}/>{t('photos.crop.cancel')}</Button>
   </>}
   <Button size="compact" variant="outline" aria-pressed={straightening} disabled={!ready||session?.cropping} aria-label={t('photos.straighten.toggle')} title={t('photos.straighten.toggle')} onClick={()=>{setStraightening(v=>!v);setHealing(false);setDodging(false);setGrading(false);setRadial(false);setBrushing(false);straightDraft.current=null;}} data-testid="photos-straighten-tool"><Ruler size={13}/>{t('photos.straighten.toggle')}</Button>
   <Button size="compact" variant="outline" aria-pressed={healing} disabled={!ready||session?.cropping} aria-label={t('photos.heal.toggle')} title={t('photos.heal.toggle')} onClick={()=>{setHealing(h=>!h);setDodging(false);setGrading(false);setRadial(false);setBrushing(false);setStraightening(false);}} data-testid="photos-heal"><Bandage size={13}/>{t('photos.heal.toggle')}</Button>
   {healing&&<NativeInput type="range" className="accent-[var(--accent)]" min={0.005} max={0.2} step={0.005} value={brushR} aria-label={t('photos.heal.radius')} onChange={e=>setBrushR(Number(e.currentTarget.value))} data-testid="photos-heal-radius"/>}
   {healing&&<Button size="compact" variant="outline" aria-pressed={healMode} aria-label={t('photos.heal.mode')} title={t('photos.heal.mode')} onClick={()=>setHealMode(!healMode)} data-testid="photos-heal-mode">{t('photos.heal.mode')}</Button>}
   <Button size="compact" variant="outline" aria-pressed={dodging} disabled={!ready||session?.cropping} aria-label={t('photos.dodge.toggle')} title={t('photos.dodge.toggle')} onClick={()=>{setDodging(d=>!d);setHealing(false);setGrading(false);setRadial(false);setBrushing(false);setStraightening(false);}} data-testid="photos-dodge"><Contrast size={13}/>{t('photos.dodge.toggle')}</Button>
   {dodging&&<>
    <NativeInput type="range" className="accent-[var(--accent)]" min={0.005} max={0.2} step={0.005} value={dabR} aria-label={t('photos.dodge.radius')} onChange={e=>setDabR(Number(e.currentTarget.value))} data-testid="photos-dodge-radius"/>
    <NativeInput type="range" className="accent-[var(--accent)]" min={-1} max={1} step={0.05} value={session?.now.localEV??0} aria-label={t('photos.dodge.amount')} onChange={e=>commitPhotoSettings(item.name,now=>({...now,localEV:Number(e.currentTarget.value)}))} data-testid="photos-dodge-amount"/>
    <NativeInput type="range" className="accent-[var(--accent)]" min={-100} max={100} step={5} value={session?.now.localSat??0} aria-label={t('photos.dodge.sat')} onChange={e=>commitPhotoSettings(item.name,now=>({...now,localSat:Number(e.currentTarget.value)}))} data-testid="photos-dodge-sat"/>
   </>}
   <Button size="compact" variant="outline" aria-pressed={grading} disabled={!ready||session?.cropping} aria-label={t('photos.grad.toggle')} title={t('photos.grad.toggle')} onClick={()=>{setGrading(g=>!g);setHealing(false);setDodging(false);setRadial(false);setBrushing(false);setStraightening(false);}} data-testid="photos-grad"><SquareDashed size={13}/>{t('photos.grad.toggle')}</Button>
   {grading&&<>
    <NativeInput type="range" className="accent-[var(--accent)]" min={-1} max={1} step={0.05} value={session?.now.gradEV??0} aria-label={t('photos.grad.ev')} onChange={e=>commitPhotoSettings(item.name,now=>({...now,gradEV:Number(e.currentTarget.value)}))} data-testid="photos-grad-ev"/>
    <NativeInput type="range" className="accent-[var(--accent)]" min={-100} max={100} step={5} value={session?.now.gradSat??0} aria-label={t('photos.grad.sat')} onChange={e=>commitPhotoSettings(item.name,now=>({...now,gradSat:Number(e.currentTarget.value)}))} data-testid="photos-grad-sat"/>
   </>}
   <Button size="compact" variant="outline" aria-pressed={radial} disabled={!ready||session?.cropping} aria-label={t('photos.rad.toggle')} title={t('photos.rad.toggle')} onClick={()=>{setRadial(r=>!r);setHealing(false);setDodging(false);setGrading(false);setBrushing(false);setStraightening(false);}} data-testid="photos-rad"><Circle size={13}/>{t('photos.rad.toggle')}</Button>
   {radial&&<>
    <NativeInput type="range" className="accent-[var(--accent)]" min={-1} max={1} step={0.05} value={session?.now.gradEV??0} aria-label={t('photos.grad.ev')} onChange={e=>commitPhotoSettings(item.name,now=>({...now,gradEV:Number(e.currentTarget.value)}))} data-testid="photos-rad-ev"/>
    <NativeInput type="range" className="accent-[var(--accent)]" min={-100} max={100} step={5} value={session?.now.gradSat??0} aria-label={t('photos.grad.sat')} onChange={e=>commitPhotoSettings(item.name,now=>({...now,gradSat:Number(e.currentTarget.value)}))} data-testid="photos-rad-sat"/>
    <Button size="compact" variant="outline" aria-pressed={radInvert} aria-label={t('photos.rad.invert')} title={t('photos.rad.invert')} onClick={()=>setRadInvert(!radInvert)} data-testid="photos-rad-invert">{t('photos.rad.invert')}</Button>
   </>}
   <Button size="compact" variant="outline" aria-pressed={brushing} disabled={!ready||session?.cropping} aria-label={t('photos.brush.toggle')} title={t('photos.brush.toggle')} onClick={()=>{setBrushing(b=>!b);setHealing(false);setDodging(false);setGrading(false);setRadial(false);setStraightening(false);}} data-testid="photos-brush"><Brush size={13}/>{t('photos.brush.toggle')}</Button>
   {brushing&&<>
    <NativeInput type="range" className="accent-[var(--accent)]" min={0.005} max={0.2} step={0.005} value={brushStrokeR} aria-label={t('photos.brush.radius')} onChange={e=>setBrushStrokeR(Number(e.currentTarget.value))} data-testid="photos-brush-radius"/>
    <NativeInput type="range" className="accent-[var(--accent)]" min={-1} max={1} step={0.05} value={brushEV} aria-label={t('photos.brush.ev')} onChange={e=>setBrushEV(Number(e.currentTarget.value))} data-testid="photos-brush-ev"/>
    <NativeInput type="range" className="accent-[var(--accent)]" min={-100} max={100} step={5} value={brushTemp} aria-label={t('photos.brush.temp')} onChange={e=>setBrushTemp(Number(e.currentTarget.value))} data-testid="photos-brush-temp"/>
    <NativeInput type="range" className="accent-[var(--accent)]" min={-100} max={100} step={5} value={brushSat} aria-label={t('photos.brush.sat')} onChange={e=>setBrushSat(Number(e.currentTarget.value))} data-testid="photos-brush-sat"/>
   </>}
   <Button size="compact" disabled={!ready||session?.cropping} onClick={()=>void doExport('png')} data-testid="photos-export-png" title={t('photos.export.hint')}><Download size={13}/>{t('photos.export.png')}</Button>
   <Button size="compact" disabled={!ready||session?.cropping} onClick={()=>void doExport('jpeg')} data-testid="photos-export-jpeg" title={t('photos.export.hint')}><Download size={13}/>{t('photos.export.jpeg')}</Button>
  </div>
  <PhotosHandoffBar file={item.name} disabled={!ready} getImage={()=>renderPhotoBytes(item.name)}/>
  <div ref={stage} className="media-checker relative min-h-0 w-full flex-1 overflow-hidden" onWheel={onWheel} onPointerDown={onStageDown} onPointerMove={onStageMove} onPointerUp={onStageUp} onPointerCancel={onStageUp} onPointerLeave={()=>{setHealCursor(null);setRgbPos(null);}} data-testid="photos-stage" style={{touchAction:'none',cursor:session?.cropping?'default':healing||dodging||grading||radial||brushing||straightening||targetArmed?'crosshair':'grab'}}>
   <div ref={imgBox} className="absolute left-1/2 top-1/2" style={{width:dispW,height:dispH,transform:`translate(-50%,-50%) translate(${pan[0]}px,${pan[1]}px)`}}>
    <canvas ref={canvas} className="block size-full rounded-[2px] shadow-sm" style={{imageRendering:scale>4?'pixelated':'auto'}} data-testid="photos-canvas"/>
    {showClipping&&<canvas ref={clipCanvas} className={`pointer-events-none absolute inset-0 size-full${scale>4?' pixelated':''}`} data-testid="photos-clipping-canvas"/>}
    {showMaskOverlay&&!lumMaskWindowNeutral(lumMask)&&<canvas ref={maskCanvas} className="pointer-events-none absolute inset-0 size-full" data-testid="photos-lummask-overlay"/>}
    {straightening&&straightDraft.current&&<svg className="pointer-events-none absolute inset-0 size-full" viewBox="0 0 1 1" preserveAspectRatio="none" data-testid="photos-straighten-line"><line x1={straightDraft.current.x0} y1={straightDraft.current.y0} x2={straightDraft.current.x1} y2={straightDraft.current.y1} stroke="var(--accent)" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeDasharray="6 4"/></svg>}
    {showSplit&&original&&<canvas ref={splitCanvas} className={`pointer-events-none absolute inset-0 size-full${scale>4?' pixelated':''}`} data-testid="photos-split-canvas"/>}
    {showSplit&&original&&<svg className="absolute inset-0 size-full" data-testid="photos-split-divider" data-direction={splitDir}>
     {splitDir==='vertical'
      ?<line x1={splitX*dispW} y1={0} x2={splitX*dispW} y2={dispH} stroke="rgba(255,255,255,0.9)" strokeWidth={2} pointerEvents="none"/>
      :<line x1={0} y1={splitX*dispH} x2={dispW} y2={splitX*dispH} stroke="rgba(255,255,255,0.9)" strokeWidth={2} pointerEvents="none"/>}
     {splitDir==='vertical'
      ?<line x1={splitX*dispW} y1={0} x2={splitX*dispW} y2={dispH} stroke="transparent" strokeWidth={14} className="cursor-col-resize" data-testid="photos-split-handle"
      onPointerDown={e=>{e.stopPropagation();(e.target as Element).setPointerCapture(e.pointerId);splitDrag.current=true;}}
      onDoubleClick={e=>{e.stopPropagation();setSplitX(0.5);}}
      onPointerMove={e=>{if(splitDrag.current){const p=pointerPos(e);setSplitX(clampSplitX(splitDir==='vertical'?p.x:p.y));}}}
      onPointerUp={()=>{splitDrag.current=false;}}
      onPointerCancel={()=>{splitDrag.current=false;}}/>
      :<line x1={0} y1={splitX*dispH} x2={dispW} y2={splitX*dispH} stroke="transparent" strokeWidth={14} className="cursor-row-resize" data-testid="photos-split-handle"
      onPointerDown={e=>{e.stopPropagation();(e.target as Element).setPointerCapture(e.pointerId);splitDrag.current=true;}}
      onPointerMove={e=>{if(splitDrag.current){const p=pointerPos(e);setSplitX(clampSplitX(p.y));}}}
      onPointerUp={()=>{splitDrag.current=false;}}
      onPointerCancel={()=>{splitDrag.current=false;}}/>}
    </svg>}
    {session?.cropping&&crop&&<div className="absolute inset-0" style={{cursor:'default'}} onPointerMove={onCropMove} onPointerUp={onCropUp} onPointerCancel={onCropUp} data-testid="photos-crop-overlay">
     <svg className="absolute inset-0 size-full" aria-hidden="true">
      <path d={`M0 0H${dispW}V${dispH}H0Z M${crop.x0*dispW} ${crop.y0*dispH}H${crop.x1*dispW}V${crop.y1*dispH}H${crop.x0*dispW}Z`} fill="rgba(0,0,0,0.45)" fillRule="evenodd"/>
      <rect x={crop.x0*dispW} y={crop.y0*dispH} width={(crop.x1-crop.x0)*dispW} height={(crop.y1-crop.y0)*dispH} fill="none" stroke="var(--accent)" strokeWidth="1.5"/>
      {showGuides&&guideLines&&<g data-testid="photos-crop-grid" data-style={guideStyle} stroke="rgba(255,255,255,0.85)" strokeWidth="1">
       {guideLines.vertical.map(x=><line key={`v${x}`} x1={x*dispW} y1={crop.y0*dispH} x2={x*dispW} y2={crop.y1*dispH}/>)}
       {guideLines.horizontal.map(y=><line key={`h${y}`} x1={crop.x0*dispW} y1={y*dispH} x2={crop.x1*dispW} y2={y*dispH}/>)}
      </g>}
     </svg>
     <div className="absolute" style={{left:`${crop.x0*100}%`,top:`${crop.y0*100}%`,width:`${(crop.x1-crop.x0)*100}%`,height:`${(crop.y1-crop.y0)*100}%`,cursor:'move'}} onPointerDown={startCropDrag({kind:'move',dx:0,dy:0})} data-testid="photos-crop-frame"/>
     {(['nw','ne','sw','se'] as const).map(k=><div key={k} className="absolute size-3 rounded-[3px] border border-white bg-[var(--accent)]" style={{left:`calc(${(k==='nw'||k==='sw'?crop.x0:crop.x1)*100}% - 6px)`,top:`calc(${(k==='nw'||k==='ne'?crop.y0:crop.y1)*100}% - 6px)`,cursor:k==='nw'||k==='se'?'nwse-resize':'nesw-resize'}} onPointerDown={startCropDrag({kind:k})} data-testid={`photos-crop-${k}`}/>)}
    </div>}
    {rgbPos&&shown&&!session?.cropping&&(()=>{const px=pixelAt(shown,rgbPos.x,rgbPos.y);return px?<div className="pointer-events-none absolute bottom-2 right-2 rounded-[3px] bg-elevated px-1.5 py-0.5 text-ink" data-testid="photos-rgb-readout">{`R ${Math.round(px[0]/255*100)} G ${Math.round(px[1]/255*100)} B ${Math.round(px[2]/255*100)}%`}</div>:null;})()}
    {(healing||dodging||brushing)&&healCursor&&!session?.cropping&&<svg className="pointer-events-none absolute inset-0 size-full" data-testid="photos-heal-cursor">
     {healStart.current&&<line x1={healStart.current.x*dispW} y1={healStart.current.y*dispH} x2={healCursor.x*dispW} y2={healCursor.y*dispH} stroke="rgba(255,255,255,0.75)" strokeWidth={1}/>}
     {healStart.current&&<circle cx={healStart.current.x*dispW} cy={healStart.current.y*dispH} r={Math.max(2,brushR*Math.min(fw,fh)*scale)} fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth={1.5} strokeDasharray="4 3"/>}
     <circle cx={healCursor.x*dispW} cy={healCursor.y*dispH} r={Math.max(2,(healing?brushR:dodging?dabR:brushStrokeR)*Math.min(fw,fh)*scale)} fill="none" stroke="var(--accent)" strokeWidth={1.5}/>
    </svg>}
    {dodging&&!session?.cropping&&session&&(session.now.dabs.length>0||dabChain.current)&&<svg className="pointer-events-none absolute inset-0 size-full" data-testid="photos-mask-overlay">
     {session.now.dabs.map((d,i)=><circle key={i} cx={d.x*dispW} cy={d.y*dispH} r={Math.max(2,d.r*Math.min(fw,fh)*scale)} fill="var(--accent)" fillOpacity={0.2} stroke="var(--accent)" strokeWidth={1} strokeOpacity={0.6} {...markerProps(i,'dab')}/>)}
     {dabChain.current?.map((d,i)=><circle key={`c${i}`} cx={d.x*dispW} cy={d.y*dispH} r={Math.max(2,d.r*Math.min(fw,fh)*scale)} fill="var(--accent)" fillOpacity={0.3}/>)}
    </svg>}
    {brushing&&!session?.cropping&&session&&(session.now.brushes.length>0||brushChain.current)&&<svg className="pointer-events-none absolute inset-0 size-full" data-testid="photos-brush-overlay">
     {session.now.brushes.map((st,i)=>{
      const cx=st.dabs.reduce((a,d)=>a+d.x,0)/st.dabs.length,cy=st.dabs.reduce((a,d)=>a+d.y,0)/st.dabs.length;
      return<g key={i}>
       {st.dabs.map((d,j)=><circle key={j} cx={d.x*dispW} cy={d.y*dispH} r={Math.max(2,d.r*Math.min(fw,fh)*scale)} fill="var(--accent)" fillOpacity={0.15} pointerEvents="none"/>)}
       <circle cx={cx*dispW} cy={cy*dispH} r={7} fill="var(--accent)" fillOpacity={0.3} stroke="var(--accent)" strokeWidth={1} {...markerProps(i,'brush')}/>
      </g>;})}
     {brushChain.current?.map((d,i)=><circle key={`c${i}`} cx={d.x*dispW} cy={d.y*dispH} r={Math.max(2,d.r*Math.min(fw,fh)*scale)} fill="var(--accent)" fillOpacity={0.3}/>)}
    </svg>}
    {healing&&!session?.cropping&&session&&session.now.spots.length>0&&<svg className="pointer-events-none absolute inset-0 size-full" data-testid="photos-heal-overlay">
     {session.now.spots.map((sp,i)=><g key={i}>
      <circle cx={sp.x*dispW} cy={sp.y*dispH} r={Math.max(3,sp.r*Math.min(fw,fh)*scale)} fill="transparent" stroke="rgba(255,255,255,0.8)" strokeWidth={1.5} {...markerProps(i,'spot')}/>
      <circle cx={sp.x*dispW} cy={sp.y*dispH} r={1.8} fill="rgba(255,255,255,0.9)" pointerEvents="none"/>
     </g>)}
    </svg>}
    {grading&&!session?.cropping&&session&&(session.now.grads.length>0||gradDraft.current)&&<svg className="pointer-events-none absolute inset-0 size-full" data-testid="photos-grad-overlay">
     {[...session.now.grads.map((g,i)=>({g,marker:i as number|null})),...(gradDraft.current?[{g:gradDraft.current,marker:null}]:[])].map(({g,marker},k)=>{
      const ax=g.x0*dispW,ay=g.y0*dispH,bx=g.x1*dispW,by=g.y1*dispH;
      const dl=Math.hypot(bx-ax,by-ay)||1,px_=-(by-ay)/dl,py_=(bx-ax)/dl,L=Math.max(dispW,dispH);
      const stroke=marker===null?'rgba(255,255,255,0.9)':'var(--accent)';
      return<g key={k}>
       <line x1={ax-px_*L} y1={ay-py_*L} x2={ax+px_*L} y2={ay+py_*L} stroke={stroke} strokeWidth={1.5} strokeOpacity={0.9} pointerEvents="none"/>
       <line x1={bx-px_*L} y1={by-py_*L} x2={bx+px_*L} y2={by+py_*L} stroke={stroke} strokeWidth={1.5} strokeOpacity={0.5} strokeDasharray="5 4" pointerEvents="none"/>
       <line x1={ax} y1={ay} x2={bx} y2={by} stroke={stroke} strokeWidth={1} strokeOpacity={0.6} pointerEvents="none"/>
       <circle cx={(ax+bx)/2} cy={(ay+by)/2} r={7} fill="var(--accent)" fillOpacity={marker===null?0.4:0.25} stroke="var(--accent)" strokeWidth={1} {...(marker===null?{pointerEvents:'none' as const}:markerProps(marker,'grad'))}/>
      </g>;})}
    </svg>}
    {radial&&!session?.cropping&&session&&(session.now.rads.length>0||radDraft.current)&&<svg className="pointer-events-none absolute inset-0 size-full" data-testid="photos-rad-overlay">
     {[...session.now.rads.map((r,i)=>({r,marker:i as number|null})),...(radDraft.current?[{r:{x:(radDraft.current.x0+radDraft.current.x1)/2,y:(radDraft.current.y0+radDraft.current.y1)/2,rx:Math.abs(radDraft.current.x1-radDraft.current.x0)/2,ry:Math.abs(radDraft.current.y1-radDraft.current.y0)/2},marker:null}]:[])].map(({r,marker},k)=>{
      const stroke=marker===null?'rgba(255,255,255,0.9)':'var(--accent)';
      const inv=('invert' in r&&r.invert)||(marker===null&&radInvert);
      return<g key={k}>
       <ellipse cx={r.x*dispW} cy={r.y*dispH} rx={r.rx*dispW} ry={r.ry*dispH} fill="none" stroke={stroke} strokeWidth={1.5} strokeOpacity={0.9} strokeDasharray={inv?'6 4':undefined} pointerEvents="none"/>
       <ellipse cx={r.x*dispW} cy={r.y*dispH} rx={r.rx*0.7*dispW} ry={r.ry*0.7*dispH} fill="none" stroke={stroke} strokeWidth={1} strokeOpacity={0.5} strokeDasharray="4 3" pointerEvents="none"/>
       <circle cx={r.x*dispW} cy={r.y*dispH} r={7} fill="var(--accent)" fillOpacity={marker===null?0.4:0.25} stroke="var(--accent)" strokeWidth={1} {...(marker===null?{pointerEvents:'none' as const}:markerProps(marker,'rad'))}/>
      </g>;})}
    </svg>}
   </div>
  </div>
  <div className="flex items-center gap-2 border-t border-subtle px-3 py-1.5 text-[12px] text-ink-2">
   <Button size="icon" variant="outline" aria-label={t('photos.zoom.out')} onClick={()=>zoomTo(scale/1.25)} data-testid="photos-zoom-out"><ZoomOut size={13}/></Button>
   <span className="w-12 text-center tabular-nums" data-testid="photos-zoom-level">{Math.round(scale*100)}%</span>
   <Button size="icon" variant="outline" aria-label={t('photos.zoom.in')} onClick={()=>zoomTo(scale*1.25)} data-testid="photos-zoom-in"><ZoomIn size={13}/></Button>
   {ZOOM_PRESETS.map(p=><Button key={p} size="compact" variant="outline" aria-pressed={isZoomPresetActive(zoom,p)} aria-label={t('photos.zoom.preset',{pct:Math.round(p*100)})} onClick={()=>zoomTo(p)} data-testid={`photos-zoom-preset-${Math.round(p*100)}`}>{zoomPresetLabel(p)}</Button>)}
   <Button size="compact" variant="outline" aria-pressed={zoom===null} onClick={()=>{setZoom(null);setPan([0,0]);}} data-testid="photos-zoom-fit"><Maximize2 size={13}/>{t('photos.zoom.fit')}</Button>
   <Button size="compact" variant="outline" onClick={()=>{setZoom(1);setPan([0,0]);}} data-testid="photos-zoom-actual"><Minimize2 size={13}/>{t('photos.zoom.actual')}</Button>
   <span className="flex-1"/>
   {session?.cropping&&<span className="text-ink-3" data-testid="photos-crop-hint">{t('photos.crop.hint')}</span>}
   <StudioStatus data-testid="photos-note">{note||(ready&&!session?.cropping?t('photos.note'):'')}</StudioStatus>
   <StudioStatus tone={session?.status==='error'?'error':'info'} live={session?.status==='error'?'assertive':'polite'} data-testid="photos-status">{status||(dirty?t('photos.status.dirty'):ready?t('photos.status.clean'):'')}</StudioStatus>
  </div>
  <PhotosFilmstrip active={item.name} onSurvey={names=>{setSurveyNames(names);setSurvey(true);}}/>
  {survey&&<PhotosSurvey names={surveyNames} live={surveyNames.length===0} items={media.items} onPick={n=>{setSurvey(false);setActiveMedia(n);}} onClose={()=>setSurvey(false)}/>}
  <PhotosShortcutsDialog/>
 </section>;
}
