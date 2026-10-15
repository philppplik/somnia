let pendingNote:string|null=null; // the workspace remounts on active change (keyed by photo name), so the copy confirmation crosses the remount here
let lastActiveName:string=''; // same remount: the previous-photo tracker must live outside the component
import {useEffect,useRef,useState,type ReactNode} from 'react';
import {Star} from 'lucide-react';
import {ChevronDown,ChevronRight,EyeOff,Flag,LayoutGrid,SkipForward,Tag,Trash2} from '../../lib/icons';
import {useT} from '../../lib/useT';
import {addMediaFile,getMedia,setActiveMedia,useMedia} from '../../lib/media';

import {rangeSelect,toggleSelect} from '../../lib/photos/selection';
import {ensurePhotoReady,syncLookToPhotos} from '../../lib/photos/batchExport';
import {findWbPreset,WB_PRESETS} from '../../lib/photos/wbPresets';
import {applyLook,BUILT_IN_PRESETS,extractLook,isNeutralLook,parseUserPresets,type Look,type UserPreset} from '../../lib/photos/presets';
import {commitPhotoSettings,getPhotoSession} from '../../lib/photos/studioSession';
import {FILMSTRIP_SORTS,type FilmstripSort} from '../../lib/photos/filmstripSort';
import {ensureCaptureDates,entryToInfo,exposureLine,getCaptureEntry} from '../../lib/photos/captureDates';
import {MAX_RATING,useRatings} from '../../lib/photos/ratings';
import {useFlags} from '../../lib/photos/flags';
import {PHOTO_LABELS,useLabels,type PhotoLabel} from '../../lib/photos/labels';
import {allTags} from '../../lib/photos/tags';
import {useCaption} from '../../lib/photos/captions';
import {cullBatch,cullSetFlag,cullSetLabel,cullSetTags,cullAddTags,cullSetCaption} from '../../lib/photos/cullHistory';
import {copyMetadata,hasMetadataClip,pasteMetadata} from '../../lib/photos/metadataClipboard';
import {SOFT_PROOF_MODEL_IDS} from '../../lib/photos/softProof';
import {allCameras,allApertures,allFocalLengths,allIsos,allLenses,allShutterSpeeds,useCaptureDates} from '../../lib/photos/captureDates';
import {groupForStrip,groupPhotos,setStackCover,ungroupStacks,useStackCovers,useStacks} from '../../lib/photos/stacks';
import {hidePhotos,unhideAll,unhidePhotos} from '../../lib/photos/hidden';
import {nextCopyName} from '../../lib/photos/virtualCopy';
import {saveSnapshot,snapshotSettings,deleteSnapshot,useSnapshots} from '../../lib/photos/snapshots';
import {addToCollection,removeFromCollection,deleteCollection,isInCollection,useCollectionNames} from '../../lib/photos/collections';
import {photoInfoLines,formatBytes} from '../../lib/photos/exifInfo';
import {detectSeries} from '../../lib/photos/autoStack';
import {usePanelState} from '../../store/panelStateStore';
import {Button} from '../ui/button';
import {NativeInput,NativeSelect} from '../ui/native-controls';
import {RatingStars} from './RatingStars';
import {useVisiblePhotos,type SmartFilter} from './useVisiblePhotos';

const tipDateFmt=new Intl.DateTimeFormat(undefined,{dateStyle:'medium',timeStyle:'short'});
/** Honest thumbnail tooltip: name plus whatever the EXIF cache has resolved - capture date, camera, pixel dimensions. */
function thumbTooltip(name:string,size:number):string{
 const parts=[name];const e=getCaptureEntry(name,size);
 if(e){if(e.t)parts.push(tipDateFmt.format(e.t));if(e.cam)parts.push(e.cam);const x=exposureLine(e);if(x)parts.push(x);if(e.w&&e.h)parts.push(`${e.w} × ${e.h}`);}
 return parts.join(' · ');
}
/** Library filmstrip under the workspace: a thumbnail per developable photo in library order; clicking switches the active photo. */
export function PhotosFilmstrip({active,onSurvey}:{active:string;onSurvey?:(names:string[])=>void}){
 const {t}=useT();
 const media=useMedia();
 const {ratings,flags,labels,tags,filter,all,total,photos,sort,query,smart,smartOn,hidden,showHidden}=useVisiblePhotos();
 const [,setSmart]=usePanelState<SmartFilter>('photos.smartFilter',{on:false,minRating:0,flag:'',label:'',tag:''});
 const [,setShowHidden]=usePanelState<boolean>('photos.showHidden',false);
 const [,setQuery]=usePanelState<string>('photos.searchQuery','');
 const [sets,setSets]=usePanelState<Record<string,{filter:string;sort:string;query:string;smart?:SmartFilter}>>('photos.filterSets',{});
 const [naming,setNaming]=useState(false);
 const [menuOpen,setMenuOpen]=useState(false);
 const stacks=useStacks();
 const covers=useStackCovers();
 const activeStack=stacks[active]??null;
 const [expanded,setExpanded]=useState<Record<string,boolean>>({});
 const [,setMinRating]=usePanelState<number|string>('photos.ratingFilter',0);
 const [,setSort]=usePanelState<FilmstripSort>('photos.filmstripSort','library');
 const [sel,setSel]=usePanelState<string[]>('photos.filmstripSelection',[]);
 const [autoAdvance,setAutoAdvance]=usePanelState<boolean>('photos.autoAdvance',false);
 const [anchor,setAnchor]=usePanelState<string|null>('photos.filmstripAnchor',null);
 const [applyNote,setApplyNote]=useState<string|null>(null);
 const [snapNaming,setSnapNaming]=useState(false);
 const [collNaming,setCollNaming]=useState(false);
 const [infoOpen,setInfoOpen]=useState(false);
 const [infoLines,setInfoLines]=useState<{key:string;value:string}[]|null>(null);
 const [statsOpen,setStatsOpen]=useState(false);
 useEffect(()=>{if(pendingNote){setApplyNote(pendingNote);pendingNote=null;}},[]); // pick up a confirmation that crossed the workspace remount
 useCaptureDates(); // re-render as EXIF resolves: camera/ISO/focal options refresh and the info effect below re-reads the entry
 const infoItem=infoOpen?getMedia().items.find(i=>i.name===active):undefined;
 const infoEntry=infoItem?getCaptureEntry(infoItem.name,infoItem.size):null;
 useEffect(()=>{ // the info panel reads the shared EXIF cache - no second fetch; a miss just warms the cache and the subscription above re-runs this effect
  if(!infoOpen){setInfoLines(null);return;}
  if(!infoItem){setInfoLines(null);return;}
  if(!infoEntry){setInfoLines(null);ensureCaptureDates([infoItem]);return;}
  const lines=photoInfoLines(entryToInfo(infoEntry));
  if(infoItem.size>0)lines.push({key:'size',value:formatBytes(infoItem.size)});
  setInfoLines(lines);
 },[infoOpen,active,infoItem,infoEntry]);
 const [armRemove,setArmRemove]=useState(false);
 const [rawPresets]=usePanelState<unknown>('photos.presets.user',[]);
 const [applying,setApplying]=useState(false);
 const [copied,setCopied]=usePanelState<Look|null>('photos.copiedLook',null);
 const strip=useRef<HTMLDivElement|null>(null);
 useEffect(()=>{strip.current?.querySelector('[aria-pressed="true"]')?.scrollIntoView({block:'nearest',inline:'nearest'});},[active]);
 const selected=photos.filter(p=>sel.includes(p.name));
 const activeSession=active?getPhotoSession(active):null;
 const caption=useCaption(active);
 const [metaClip,setMetaClip]=useState(hasMetadataClip()); // session clipboard for culling metadata
 const snapNames=useSnapshots(active);
 const [collection,setCollection]=usePanelState<string>('photos.collection','');
 const [reference,setReference]=usePanelState<string>('photos.reference',''); // compare view: the photo the active one is measured against
 const [split,setSplit]=usePanelState<boolean>('photos.split',false);
 const [proof,setProof]=usePanelState<boolean>('photos.softProof',false); // workspace reads these: shared view state like the split
 const [gamutWarn,setGamutWarn]=usePanelState<boolean>('photos.gamutWarn',false);
 const [proofModel,setProofModel]=usePanelState<string>('photos.proofModel','coated');
 const [gamutSharePct]=usePanelState<number>('photos.gamutShare',0); // published by the workspace

 const [splitDir,setSplitDir]=usePanelState<'vertical'|'horizontal'>('photos.splitDir','vertical');
 const [slide,setSlide]=usePanelState<boolean>('photos.slideshow',false);
 const [slideMs,setSlideMs]=usePanelState<number>('photos.slideshowMs',4000);
 const [,setShortcuts]=usePanelState<boolean>('photos.shortcuts',false);
 const [grpFilter,setGrpFilter]=usePanelState<boolean>('photos.menuGroup.filter',false); // collapsed flags, expanded by default
 const [grpView,setGrpView]=usePanelState<boolean>('photos.menuGroup.view',false);
 const [grpEdit,setGrpEdit]=usePanelState<boolean>('photos.menuGroup.edit',false);
 const [grpCollections,setGrpCollections]=usePanelState<boolean>('photos.menuGroup.collections',false);
 const [grpInfo,setGrpInfo]=usePanelState<boolean>('photos.menuGroup.info',false);
 const [previous,setPrevious]=usePanelState<string>('photos.previousPhoto',''); // last active photo, for one-click settings paste
 useEffect(()=>{if(active&&active!==lastActiveName){if(lastActiveName)setPrevious(lastActiveName);lastActiveName=active;}},[active,setPrevious]); // module-level: a ref would reset on the workspace remount
 const slidePhotos=useRef(photos);slidePhotos.current=photos;
 const grp:Record<string,[boolean,(v:boolean)=>void]>={filter:[grpFilter,setGrpFilter],view:[grpView,setGrpView],edit:[grpEdit,setGrpEdit],collections:[grpCollections,setGrpCollections],info:[grpInfo,setGrpInfo]};
 const menuGroup=(id:string,titleKey:string,kids:ReactNode)=>{ // a render helper, not a component: a nested component type would remount the menu children every render
  const[coll,setColl]=grp[id];
  return <div className="grid gap-1" data-testid={`photos-filmstrip-groupbox-${id}`}>
   <Button variant="ghost" size="compact" aria-expanded={!coll} onClick={()=>setColl(!coll)} className="justify-start text-ink-3" data-testid={`photos-filmstrip-group-${id}`}>{coll?<ChevronRight size={12}/>:<ChevronDown size={12}/>}{t(titleKey)}</Button>
   {!coll&&<div className="grid gap-2">{kids}</div>}
  </div>;
 };
 useEffect(()=>{ // slideshow: advance through the filtered view on the chosen tempo, looping
  if(!slide)return;
  const id=setInterval(()=>{
   const list=slidePhotos.current;if(list.length<2)return;
   const idx=list.findIndex(p=>p.name===getMedia().active);
   const next=list[(idx+1)%list.length];
   if(next&&next.name!==getMedia().active)setActiveMedia(next.name);
  },Math.max(200,slideMs));
  return()=>clearInterval(id);
 },[slide,slideMs]);
 const collNames=useCollectionNames();
 const neutral=!activeSession||isNeutralLook(activeSession.now); // nothing worth applying
 const userPresets:UserPreset[]=parseUserPresets(rawPresets);
 const applyLookToSelection=async(look:Parameters<typeof syncLookToPhotos>[1])=>{
  if(applying||selected.length<2)return;
  setApplying(true);setApplyNote(null);
  const out=await syncLookToPhotos(selected,look);
  setApplyNote(t('photos.filmstrip.applyDone',{applied:out.saved.length,failed:out.failed.length}));
  setApplying(false);
 };
 const applyToSelection=async()=>{
  if(applying||selected.length<2||!activeSession||neutral)return;
  await applyLookToSelection(extractLook(activeSession.now));
 };
 const rejected=all.filter(p=>flags[p.name]==='reject');
 const makeVirtualCopy=async()=>{
  const item=media.items.find(i=>i.name===active);if(!item)return;
  const settings=getPhotoSession(active)?.now; // copies start with the source's develop settings
  try{
   const blob=await (await fetch(item.url)).blob();
   const name=nextCopyName(active,t('photos.copy.word'),n=>getMedia().items.some(i=>i.name===n));
   pendingNote=t('photos.copy.done',{name}); // addMediaFile activates the copy, which remounts the workspace (keyed by photo name); the initializer picks up pendingNote
   const res=await addMediaFile(blob,name);
   if('error' in res){pendingNote=null;setApplyNote(t('photos.copy.failed'));return;}
   const created=getMedia().items.find(i=>i.name===res.name);
   if(created){await ensurePhotoReady(created);if(settings)commitPhotoSettings(res.name,()=>settings);}
   setActiveMedia(res.name);
   setMenuOpen(false);
  }catch{pendingNote=null;setApplyNote(t('photos.copy.failed'));}
 };
 const removeRejected=()=>{
  if(!armRemove){setArmRemove(true);return;}
  setArmRemove(false);
  const names=new Set(rejected.map(p=>p.name));
  hidePhotos([...names]); // hidden from the library view only - originals are never deleted, undo lives in the menu
  setSel(sel.filter(n=>!names.has(n)));
  if(names.has(active)){const next=all.find(p=>!names.has(p.name));setActiveMedia(next?next.name:null);}
 };
 useEffect(()=>{ensureCaptureDates(photos);},[photos]); // visible thumbs fetch their EXIF line lazily: date, camera and dimensions fill the tooltip
 useEffect(()=>{ // Ctrl/Cmd+A selects the visible strip like the select dropdown; editable targets keep native select-all
  const onKey=(e:KeyboardEvent)=>{
   if((e.ctrlKey||e.metaKey)&&!e.altKey&&!e.shiftKey&&(e.key==='a'||e.key==='A')){
    const el=e.target as HTMLElement|null;
    if(el&&el.closest('input,select,textarea,[contenteditable="true"]'))return;
    e.preventDefault();setSel(photos.map(p=>p.name));
   }
  };
  window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey);
 },[photos,setSel]);
 if(total<2&&hidden.length===0)return null; // stays mounted while hidden photos exist: the restore entry lives in the menu
 const thumb=(p:(typeof photos)[number])=><Button key={p.name} variant="outline" size="compact" aria-pressed={p.name===active} aria-label={p.name} onClick={e=>{
   if(e.shiftKey){const names=photos.map(q=>q.name);setSel(rangeSelect(names,anchor,p.name));}
   else if(e.ctrlKey||e.metaKey){setSel(toggleSelect(sel,p.name));setAnchor(p.name);}
   else{setSel([p.name]);setAnchor(p.name);setApplyNote(null);setActiveMedia(p.name);}
  }} title={thumbTooltip(p.name,p.size)} className={`relative h-14 shrink-0 overflow-hidden px-0.5${sel.includes(p.name)&&sel.length>1?' ring-2 ring-[var(--accent)]':''}`} data-selected={sel.includes(p.name)&&sel.length>1||undefined} data-testid={`photos-filmstrip-item-${p.name}`}>
   <img src={p.url} alt="" className={`h-full w-auto max-w-24 rounded-[2px] object-cover${hidden.includes(p.name)?' opacity-40':''}`}/>
   {hidden.includes(p.name)&&<span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-[2px] bg-elevated p-0.5 text-ink-3" data-testid={`photos-filmstrip-hidden-badge-${p.name}`}><EyeOff size={12}/></span>}
   {labels[p.name]&&<span className={`photos-label-dot photos-label-${labels[p.name]} absolute top-0.5 right-0.5`} data-testid={`photos-filmstrip-label-${p.name}`} data-label={labels[p.name]}/>}
   {(tags[p.name]?.length??0)>0&&<span className="absolute top-0.5 left-0.5 flex max-w-[70%] items-center gap-0.5 truncate rounded-[2px] bg-elevated px-1 text-ink-3" title={(tags[p.name]??[]).join(', ')} data-testid={`photos-filmstrip-tags-badge-${p.name}`}><Tag size={10}/>{tags[p.name]![0]}{tags[p.name]!.length>1?` +${tags[p.name]!.length-1}`:''}</span>}
   {(ratings[p.name]??0)>0&&<span className="absolute bottom-0.5 right-0.5 flex items-center gap-0.5 rounded-[2px] bg-elevated px-1 text-ink" data-testid={`photos-filmstrip-rating-badge-${p.name}`}><Star size={10} fill="currentColor" className="text-[var(--accent)]"/>{ratings[p.name]}</span>}
   {flags[p.name]&&<span className="absolute bottom-0.5 left-0.5 flex items-center rounded-[2px] bg-elevated px-1 text-ink" data-testid={`photos-filmstrip-flag-${p.name}`} data-flag={flags[p.name]}><Flag size={10} fill="currentColor" className={flags[p.name]==='pick'?'text-[var(--accent)]':'text-[var(--danger)]'}/></span>}
  </Button>;
 const byName=(n:string)=>photos.find(p=>p.name===n)!;
 return <div ref={strip} className={`photos-filmstrip flex items-center gap-1.5 border-t border-subtle px-3 py-1.5 ${menuOpen?'overflow-visible':'overflow-x-auto'}`} role="navigation" aria-label={t('photos.filmstrip.aria')} data-testid="photos-filmstrip">
  <span className="relative shrink-0">
   <Button variant="outline" size="compact" aria-expanded={menuOpen} aria-pressed={smartOn} aria-label={t('photos.menu')} title={t('photos.menu')} onClick={()=>setMenuOpen(!menuOpen)} data-testid="photos-filmstrip-menu">{t('photos.menu')}</Button>
   {menuOpen&&<div className="menu-popup absolute bottom-full left-0 mb-1 grid max-h-[70vh] w-60 gap-2 overflow-y-auto" data-testid="photos-filmstrip-menu-panel" onKeyDown={e=>{if(e.key==='Escape')setMenuOpen(false);}}>
    {menuGroup('filter','photos.menu.groupFilter',<>
    <div className="grid gap-1">
          <Button variant="outline" size="compact" aria-pressed={smart.on} aria-label={t('photos.smart')} title={t('photos.smart')} onClick={()=>setSmart({...smart,on:!smart.on})} data-testid="photos-filmstrip-smart">{t('photos.smart')}</Button>
          {smart.on&&<div className="grid gap-1">
           <NativeSelect value={String(smart.minRating)} aria-label={t('photos.rating.filter')} title={t('photos.rating.filter')} onChange={e=>setSmart({...smart,minRating:Number(e.currentTarget.value)})} className="h-7" data-testid="photos-smart-minrating">
            {[0,1,2,3,4,5].map(n=><option key={n} value={String(n)}>{`≥ ${n}`}</option>)}
           </NativeSelect>
           <NativeSelect value={smart.flag} aria-label={t('photos.smart')} title={t('photos.smart')} onChange={e=>setSmart({...smart,flag:e.currentTarget.value})} className="h-7" data-testid="photos-smart-flag">
            <option value="">{t('photos.smart.anyFlag')}</option>
            <option value="pick">{t('photos.flag.filter.pick')}</option>
            <option value="reject">{t('photos.flag.filter.reject')}</option>
            <option value="none">{t('photos.smart.unflagged')}</option>
           </NativeSelect>
           <NativeSelect value={smart.label} aria-label={t('photos.smart')} title={t('photos.smart')} onChange={e=>setSmart({...smart,label:e.currentTarget.value})} className="h-7" data-testid="photos-smart-label">
            <option value="">{t('photos.smart.anyLabel')}</option>
            <option value="none">{t('photos.smart.noLabel')}</option>
            {PHOTO_LABELS.map(l=><option key={l} value={l}>{t(`photos.label.${l}`)}</option>)}
           </NativeSelect>
           <NativeInput type="text" value={smart.tag} aria-label={t('photos.smart.tag')} title={t('photos.smart.tag')} placeholder={t('photos.smart.tag')} onChange={e=>setSmart({...smart,tag:e.currentTarget.value})} className="h-7" data-testid="photos-smart-tag"/>
           <NativeSelect value={smart.camera??''} aria-label={t('photos.smart.camera')} title={t('photos.smart.camera')} onChange={e=>setSmart({...smart,camera:e.currentTarget.value})} className="h-7" data-testid="photos-smart-camera">
            <option value="">{t('photos.smart.anyCamera')}</option>
            {allCameras().map(c=><option key={c} value={c}>{c}</option>)}
           </NativeSelect>
           <NativeSelect value={smart.type??''} aria-label={t('photos.smart.type')} title={t('photos.smart.type')} onChange={e=>setSmart({...smart,type:e.currentTarget.value})} className="h-7" data-testid="photos-smart-type">
            <option value="">{t('photos.smart.anyType')}</option>
            {['jpeg','png','webp','psd','other'].map(ft=><option key={ft} value={ft}>{t(`photos.smart.type.${ft}`)}</option>)}
           </NativeSelect>
           <NativeSelect value={smart.orient??''} aria-label={t('photos.smart.orient')} title={t('photos.smart.orient')} onChange={e=>setSmart({...smart,orient:e.currentTarget.value})} className="h-7" data-testid="photos-smart-orient">
            <option value="">{t('photos.smart.anyOrient')}</option>
            {['landscape','portrait','square'].map(o=><option key={o} value={o}>{t(`photos.smart.orient.${o}`)}</option>)}
           </NativeSelect>
           <NativeSelect value={smart.iso??''} aria-label={t('photos.smart.iso')} title={t('photos.smart.iso')} onChange={e=>setSmart({...smart,iso:e.currentTarget.value})} className="h-7" data-testid="photos-smart-iso">
            <option value="">{t('photos.smart.anyIso')}</option>
            {allIsos().map(i=><option key={i} value={String(i)}>{`ISO ${i}`}</option>)}
           </NativeSelect>
           <NativeSelect value={smart.fl??''} aria-label={t('photos.smart.fl')} title={t('photos.smart.fl')} onChange={e=>setSmart({...smart,fl:e.currentTarget.value})} className="h-7" data-testid="photos-smart-fl">
            <option value="">{t('photos.smart.anyFl')}</option>
            {allFocalLengths().map(f=><option key={f} value={f}>{f}</option>)}
           </NativeSelect>
           <NativeSelect value={smart.lens??''} aria-label={t('photos.smart.lens')} title={t('photos.smart.lens')} onChange={e=>setSmart({...smart,lens:e.currentTarget.value})} className="h-7" data-testid="photos-smart-lens">
            <option value="">{t('photos.smart.anyLens')}</option>
            {allLenses().map(l=><option key={l} value={l}>{l}</option>)}
           </NativeSelect>
           <NativeSelect value={smart.ap??''} aria-label={t('photos.smart.aperture')} title={t('photos.smart.aperture')} onChange={e=>setSmart({...smart,ap:e.currentTarget.value})} className="h-7" data-testid="photos-smart-aperture">
            <option value="">{t('photos.smart.anyAperture')}</option>
            {allApertures().map(a=><option key={a} value={a}>{a}</option>)}
           </NativeSelect>
           <NativeSelect value={smart.exp??''} aria-label={t('photos.smart.shutter')} title={t('photos.smart.shutter')} onChange={e=>setSmart({...smart,exp:e.currentTarget.value})} className="h-7" data-testid="photos-smart-shutter">
            <option value="">{t('photos.smart.anyShutter')}</option>
            {allShutterSpeeds().map(x=><option key={x} value={x}>{x}</option>)}
           </NativeSelect>
           <Button variant="outline" size="compact" aria-pressed={!!smart.dup} onClick={()=>setSmart({...smart,dup:!smart.dup})} data-testid="photos-smart-dup">{t('photos.smart.dup')}</Button>
          </div>}
         </div>
         <div className="grid gap-1">
          <NativeSelect value="" aria-label={t('photos.collections')} title={t('photos.collections')} onChange={e=>{
           const fs=sets[e.currentTarget.value];e.currentTarget.value='';
           if(fs){setMinRating(fs.filter);setSort(fs.sort as FilmstripSort);setQuery(fs.query);setSmart(fs.smart??{on:false,minRating:0,flag:'',label:'',tag:''});}
          }} className="h-7" data-testid="photos-filmstrip-collections">
           <option value="" disabled>{t('photos.collections')}</option>
           {Object.keys(sets).sort((a,b)=>a.localeCompare(b)).map(n=><option key={n} value={n}>{n}</option>)}
          </NativeSelect>
          <span className="flex gap-1">
           {naming
            ?<NativeInput autoFocus type="text" aria-label={t('photos.collections.name')} title={t('photos.collections.name')} placeholder={t('photos.collections.name')} className="h-7 w-full" data-testid="photos-filmstrip-collection-name"
              onKeyDown={e=>{
               if(e.key==='Escape'){setNaming(false);return;}
               if(e.key!=='Enter')return;
               const n=e.currentTarget.value.trim();
               if(n)setSets({...sets,[n]:{filter,sort,query,smart}});
               setNaming(false);
              }}/>
            :<Button variant="outline" size="compact" aria-label={t('photos.collections.save')} title={t('photos.collections.save')} onClick={()=>setNaming(true)} data-testid="photos-filmstrip-collection-save">{t('photos.collections.save')}</Button>}
           {(()=>{const hit=Object.entries(sets).find(([,fs])=>fs.filter===filter&&fs.sort===sort&&fs.query===query&&(fs.smart?.on??false)===smart.on&&Number(fs.smart?.minRating??0)===smart.minRating&&(fs.smart?.flag??'')===smart.flag&&(fs.smart?.label??'')===smart.label&&(fs.smart?.tag??'')===smart.tag);return hit?<Button variant="outline" size="compact" aria-label={t('photos.collections.delete')} title={t('photos.collections.delete')} onClick={()=>{const next={...sets};delete next[hit[0]];setSets(next);}} data-testid="photos-filmstrip-collection-delete">{t('photos.collections.delete')}</Button>:null;})()}
          </span>
         </div>
         {hidden.length>0&&<span className="flex flex-wrap gap-1">
          <Button variant="outline" size="compact" aria-pressed={showHidden} onClick={()=>setShowHidden(!showHidden)} data-testid="photos-filmstrip-show-hidden">{t('photos.hidden.show')}</Button>
          {showHidden&&hidden.includes(active)&&<Button variant="outline" size="compact" onClick={()=>unhidePhotos([active])} data-testid="photos-filmstrip-unhide-active">{t('photos.hidden.restoreActive')}</Button>}
          <Button variant="outline" size="compact" onClick={()=>unhideAll()} data-testid="photos-filmstrip-restore-hidden">{t('photos.hidden.restore',{count:hidden.length})}</Button>
         </span>}
    </>)}
    {menuGroup('view','photos.menu.groupView',<>
    <span className="flex flex-wrap gap-1">
          <Button variant="outline" size="compact" aria-pressed={proof} onClick={()=>setProof(!proof)} data-testid="photos-filmstrip-softproof">{t('photos.proof.toggle')}</Button>
          <Button variant="outline" size="compact" aria-pressed={gamutWarn} onClick={()=>setGamutWarn(!gamutWarn)} data-testid="photos-filmstrip-gamut">{t('photos.proof.gamut')}</Button>
          {proof&&<NativeSelect value={proofModel} aria-label={t('photos.proof.model')} title={t('photos.proof.model')} onChange={e=>setProofModel(e.currentTarget.value)} className="h-7" data-testid="photos-filmstrip-proof-model">
           {SOFT_PROOF_MODEL_IDS.map(m=><option key={m} value={m}>{t(`photos.proof.model.${m}`)}</option>)}
          </NativeSelect>}
          <Button variant="outline" size="compact" aria-pressed={split} onClick={()=>setSplit(!split)} data-testid="photos-filmstrip-split">{t('photos.split')}</Button>
          {split&&<Button variant="outline" size="compact" aria-pressed={splitDir==='horizontal'} onClick={()=>setSplitDir(splitDir==='vertical'?'horizontal':'vertical')} data-testid="photos-filmstrip-split-dir">{t('photos.split.dir')}</Button>}
         </span>
         {gamutWarn&&<span className="text-ink-3" data-testid="photos-filmstrip-gamut-share">{t('photos.proof.share',{pct:(gamutSharePct*100).toFixed(1)})}</span>}
         <span className="flex flex-wrap gap-1">
          {reference!==active&&<Button variant="outline" size="compact" onClick={()=>{setReference(active);setApplyNote(t('photos.compare.referenceSet',{name:active}));}} data-testid="photos-filmstrip-set-reference">{t('photos.compare.setReference')}</Button>}
          {reference&&reference!==active&&onSurvey&&<Button variant="outline" size="compact" onClick={()=>{setMenuOpen(false);onSurvey([reference,active]);}} data-testid="photos-filmstrip-compare-reference">{t('photos.compare.go')}</Button>}
          {reference&&<Button variant="outline" size="compact" onClick={()=>setReference('')} data-testid="photos-filmstrip-clear-reference">{t('photos.compare.clear')}</Button>}
         </span>
         <span className="flex flex-wrap gap-1">
          <Button variant="outline" size="compact" aria-pressed={slide} onClick={()=>setSlide(!slide)} data-testid="photos-filmstrip-slideshow">{t('photos.slideshow')}</Button>
          {slide&&<NativeSelect value={String(slideMs)} aria-label={t('photos.slideshow.tempo')} title={t('photos.slideshow.tempo')} onChange={e=>setSlideMs(Number(e.currentTarget.value))} className="h-7" data-testid="photos-filmstrip-slideshow-ms">
           {[2000,4000,8000].map(ms=><option key={ms} value={ms}>{ms/1000} s</option>)}
          </NativeSelect>}
         </span>
    </>)}
    {menuGroup('edit','photos.menu.groupEdit',<>
    <span className="flex flex-wrap gap-1">
          <Button variant="outline" size="compact" onClick={()=>{void makeVirtualCopy();}} data-testid="photos-filmstrip-virtual-copy">{t('photos.copy.create')}</Button>
         </span>
         <div className="grid gap-1">
          {snapNames.map(n=><span key={n} className="flex gap-1">
           <Button variant="outline" size="compact" className="flex-1 justify-start" onClick={()=>{
            const snap=snapshotSettings(active,n);
            if(snap){commitPhotoSettings(active,()=>snap);setApplyNote(t('photos.snapshots.applied',{name:n}));}
           }} data-testid={`photos-filmstrip-snapshot-apply-${n}`}>{n}</Button>
           <Button variant="outline" size="icon" aria-label={t('photos.snapshots.delete',{name:n})} title={t('photos.snapshots.delete',{name:n})} onClick={()=>deleteSnapshot(active,n)} className="h-7 w-7 shrink-0" data-testid={`photos-filmstrip-snapshot-delete-${n}`}><Trash2 size={12}/></Button>
          </span>)}
          {snapNaming
           ?<NativeInput autoFocus type="text" aria-label={t('photos.snapshots.name')} title={t('photos.snapshots.name')} placeholder={t('photos.snapshots.name')} className="h-7 w-full" data-testid="photos-filmstrip-snapshot-name"
             onKeyDown={e=>{
              if(e.key==='Escape'){setSnapNaming(false);return;}
              if(e.key!=='Enter')return;
              const n=e.currentTarget.value.trim();
              if(n&&activeSession&&saveSnapshot(active,n,activeSession.now))setApplyNote(t('photos.snapshots.saved',{name:n}));
              setSnapNaming(false);
             }}/>
           :<Button variant="outline" size="compact" aria-label={t('photos.snapshots.save')} title={t('photos.snapshots.save')} onClick={()=>setSnapNaming(true)} disabled={!activeSession} data-testid="photos-filmstrip-snapshot-save">{t('photos.snapshots.save')}</Button>}
         </div>
         <span className="flex flex-wrap gap-1">
          <Button variant="outline" size="compact" disabled={!previous||previous===active||!getPhotoSession(previous)} title={previous||undefined} onClick={()=>{
           const from=getPhotoSession(previous);
           if(from){commitPhotoSettings(active,()=>from.now);setApplyNote(t('photos.quick.pastedPrevious',{name:previous}));}
          }} data-testid="photos-filmstrip-paste-previous">{t('photos.quick.pastePrevious')}</Button>
          <Button variant="outline" size="compact" disabled={!activeSession} onClick={()=>commitPhotoSettings(active,cur=>({...cur,orientation:((cur.orientation+3)%4) as typeof cur.orientation}))} data-testid="photos-filmstrip-rotate-left">{t('photos.quick.rotateLeft')}</Button>
          <Button variant="outline" size="compact" disabled={!activeSession} onClick={()=>commitPhotoSettings(active,cur=>({...cur,orientation:((cur.orientation+1)%4) as typeof cur.orientation}))} data-testid="photos-filmstrip-rotate-right">{t('photos.quick.rotateRight')}</Button>
         </span>
         <span className="flex flex-wrap gap-1">
          <Button variant="outline" size="compact" disabled={!active} onClick={()=>{copyMetadata(active);setMetaClip(true);setApplyNote(t('photos.metadata.copied',{name:active}));}} data-testid="photos-filmstrip-metadata-copy">{t('photos.metadata.copy')}</Button>
          <Button variant="outline" size="compact" disabled={!metaClip} onClick={()=>{const targets=selected.length>1?selected.map(p=>p.name):[active];const n=pasteMetadata(targets);setApplyNote(t('photos.metadata.pasted',{count:n}));}} data-testid="photos-filmstrip-metadata-paste">{t('photos.metadata.paste')}</Button>
         </span>
    </>)}
    {menuGroup('collections','photos.menu.groupCollections',<>
    <span className="flex flex-wrap gap-1">
          {onSurvey&&activeStack&&<Button variant="outline" size="compact" onClick={()=>{setMenuOpen(false);onSurvey(photos.map(p=>p.name).filter(n=>stacks[n]===activeStack));}} data-testid="photos-filmstrip-stack-survey">{t('photos.stacks.survey')}</Button>}
          {activeStack&&covers[activeStack]!==active&&<Button variant="outline" size="compact" onClick={()=>setStackCover(activeStack,active)} data-testid="photos-filmstrip-stack-cover">{t('photos.stacks.cover')}</Button>}
          {activeStack&&<Button variant="outline" size="compact" onClick={()=>{
           const members=photos.map(p=>p.name).filter(n=>stacks[n]===activeStack);
           const cover=covers[activeStack]??members[0];
           if(!cover)return;
           cullBatch(()=>{for(const n of members)cullSetFlag(n,n===cover?'pick':'reject');});
          }} data-testid="photos-filmstrip-stack-cull">{t('photos.stacks.cull')}</Button>}
          {selected.length>1&&<Button variant="outline" size="compact" onClick={()=>groupPhotos(selected.map(p=>p.name))} data-testid="photos-filmstrip-stack-group">{t('photos.stacks.group')}</Button>}
          {(()=>{const ids=[...new Set((selected.length>1?selected.map(p=>p.name):[active]).map(n=>stacks[n]).filter((v):v is string=>!!v))];return ids.length>0?<Button variant="outline" size="compact" onClick={()=>ungroupStacks(ids)} data-testid="photos-filmstrip-stack-ungroup">{t('photos.stacks.ungroup')}</Button>:null;})()}
          {detectSeries(all.map(p=>p.name)).length>0&&<Button variant="outline" size="compact" onClick={()=>{
           let n=0;for(const series of detectSeries(all.map(p=>p.name)))if(groupPhotos(series))n++;
           setApplyNote(t('photos.stacks.autoDone',{count:n}));
          }} data-testid="photos-filmstrip-stack-auto">{t('photos.stacks.auto')}</Button>}
         </span>
         <div className="grid gap-1">
          <NativeSelect value={collection} aria-label={t('photos.photoCollections')} title={t('photos.photoCollections')} onChange={e=>setCollection(e.currentTarget.value)} className="h-7" data-testid="photos-filmstrip-collection-apply">
           <option value="">{t('photos.photoCollections.off')}</option>
           {collNames.map(n=><option key={n} value={n}>{n}</option>)}
          </NativeSelect>
          <span className="flex gap-1">
           {collNaming
            ?<NativeInput autoFocus type="text" aria-label={t('photos.photoCollections.name')} title={t('photos.photoCollections.name')} placeholder={t('photos.photoCollections.name')} className="h-7 w-full" data-testid="photos-filmstrip-collection-name"
              onKeyDown={e=>{
               if(e.key==='Escape'){setCollNaming(false);return;}
               if(e.key!=='Enter')return;
               const n=e.currentTarget.value.trim();
               if(n){
                const targets=selected.length>1?selected.map(p=>p.name):[active]; // the selection joins, else just the active photo
                const added=addToCollection(n,targets);
                setApplyNote(t('photos.photoCollections.added',{count:added,name:n}));
                setCollection(n);
               }
               setCollNaming(false);
              }}/>
            :<Button variant="outline" size="compact" aria-label={t('photos.photoCollections.add')} title={t('photos.photoCollections.add')} onClick={()=>setCollNaming(true)} data-testid="photos-filmstrip-collection-add">{t('photos.photoCollections.add')}</Button>}
           {collection&&isInCollection(collection,active)&&<Button variant="outline" size="compact" onClick={()=>removeFromCollection(collection,[active])} data-testid="photos-filmstrip-collection-remove">{t('photos.photoCollections.removeActive')}</Button>}
           {collection&&<Button variant="outline" size="compact" onClick={()=>{deleteCollection(collection);setCollection('');}} data-testid="photos-filmstrip-collection-drop">{t('photos.photoCollections.delete')}</Button>}
          </span>
         </div>
    </>)}
    {menuGroup('info','photos.menu.groupInfo',<>
    <span className="flex flex-wrap gap-1">
          <Button variant="outline" size="compact" aria-pressed={infoOpen} onClick={()=>setInfoOpen(!infoOpen)} data-testid="photos-filmstrip-info-toggle">{t('photos.info.toggle')}</Button>
          <Button variant="outline" size="compact" onClick={()=>{setMenuOpen(false);setShortcuts(true);}} data-testid="photos-filmstrip-shortcuts">{t('photos.keys.title')}</Button>
          <Button variant="outline" size="compact" aria-pressed={statsOpen} onClick={()=>setStatsOpen(!statsOpen)} data-testid="photos-filmstrip-stats">{t('photos.stats')}</Button>
         </span>
         {active&&<NativeInput value={caption} aria-label={t('photos.caption')} title={t('photos.caption')} placeholder={t('photos.caption')} onChange={e=>cullSetCaption(active,e.currentTarget.value)} className="h-7 w-full" data-testid="photos-filmstrip-caption"/>}
         {statsOpen&&<div className="grid gap-0.5 text-ink-3" data-testid="photos-filmstrip-stats-panel">
          <span data-testid="photos-filmstrip-stats-visible">{t('photos.stats.visible',{shown:photos.length,total})}</span>
          {(()=>{const dist=[5,4,3,2,1].map(r=>({r,n:all.filter(p=>(ratings[p.name]??0)===r).length})).filter(d=>d.n>0);const unrated=all.filter(p=>!(ratings[p.name]>=1)).length;
           return <span data-testid="photos-filmstrip-stats-ratings">{[...dist.map(d=>`${d.r}★ ×${d.n}`),unrated>0?`${t('photos.stats.unrated')} ×${unrated}`:''].filter(Boolean).join(' · ')||t('photos.stats.empty')}</span>;})()}
          {(()=>{const picks=all.filter(p=>flags[p.name]==='pick').length,rejects=all.filter(p=>flags[p.name]==='reject').length;
           return picks+rejects>0?<span data-testid="photos-filmstrip-stats-flags">{[picks>0?`${t('photos.stats.picks')} ×${picks}`:'',rejects>0?`${t('photos.stats.rejects')} ×${rejects}`:''].filter(Boolean).join(' · ')}</span>:null;})()}
          {hidden.length>0&&<span data-testid="photos-filmstrip-stats-hidden">{t('photos.stats.hidden',{count:hidden.length})}</span>}
         </div>}
         {infoOpen&&<div className="grid gap-0.5 text-ink-3" data-testid="photos-filmstrip-info">
          {infoLines===null?<span data-testid="photos-filmstrip-info-loading">…</span>
           :infoLines.length===0?<span data-testid="photos-filmstrip-info-empty">{t('photos.info.empty')}</span>
           :infoLines.map(l=><span key={l.key} data-testid={`photos-filmstrip-info-${l.key}`}>{l.value}</span>)}
         </div>}
    </>)}
   </div>}
  </span>
  <NativeSelect value={filter} aria-label={t('photos.rating.filter')} title={t('photos.rating.filter')} onChange={e=>setMinRating(e.currentTarget.value)} disabled={smartOn} className="h-7 shrink-0" data-testid="photos-filmstrip-rating-filter">
   <option value="0">{t('photos.rating.filter.all')}</option>
   {Array.from({length:MAX_RATING},(_,i)=>i+1).map(n=><option key={n} value={String(n)}>{`≥ ${n}`}</option>)}
   <option value="unrated">{t('photos.rating.filter.unrated')}</option>
   <option value="pick">{t('photos.flag.filter.pick')}</option>
   <option value="reject">{t('photos.flag.filter.reject')}</option>
   {PHOTO_LABELS.map(l=><option key={l} value={`label:${l}`}>{t(`photos.label.${l}`)}</option>)}
   {allTags().map(tag=><option key={tag} value={`tag:${tag}`}>{tag}</option>)}
  </NativeSelect>
  <NativeSelect value={sort} aria-label={t('photos.filmstrip.sort')} title={t('photos.filmstrip.sort')} onChange={e=>setSort(e.currentTarget.value as FilmstripSort)} className="h-7 shrink-0" data-testid="photos-filmstrip-sort">
   {FILMSTRIP_SORTS.map(m=><option key={m} value={m}>{t(`photos.filmstrip.sort.${m}`)}</option>)}
  </NativeSelect>
  <NativeSelect value="" aria-label={t('photos.filmstrip.select')} title={t('photos.filmstrip.select')} onChange={e=>{
   const v=e.currentTarget.value;e.currentTarget.value='';
   if(v==='all')setSel(photos.map(p=>p.name));
   else if(v==='unrated')setSel(photos.filter(p=>!(ratings[p.name]>=1)).map(p=>p.name));
   else if(v==='none')setSel([]);
  }} className="h-7 shrink-0" data-testid="photos-filmstrip-select">
   <option value="" disabled>{t('photos.filmstrip.select')}</option>
   <option value="all">{t('photos.filmstrip.selectAll')}</option>
   <option value="unrated">{t('photos.filmstrip.selectUnrated')}</option>
   <option value="none">{t('photos.filmstrip.selectNone')}</option>
  </NativeSelect>
  <NativeSelect value="" aria-label={t('photos.label.set')} title={t('photos.label.set')} onChange={e=>{
   const v=e.currentTarget.value;e.currentTarget.value='';
   cullBatch(()=>{for(const n of selected.length>1?selected.map(p=>p.name):[active])cullSetLabel(n,v==='none'?null:v as PhotoLabel);}); // selection first, else the active photo
  }} className="h-7 shrink-0" data-testid="photos-filmstrip-label">
   <option value="" disabled>{t('photos.label.set')}</option>
   {PHOTO_LABELS.map(l=><option key={l} value={l}>{t(`photos.label.${l}`)}</option>)}
   <option value="none">{t('photos.label.none')}</option>
  </NativeSelect>
  <NativeInput type="search" value={query} aria-label={t('photos.search')} title={t('photos.search')} placeholder={t('photos.search')} onChange={e=>setQuery(e.currentTarget.value)} className="h-7 w-28 shrink-0" data-testid="photos-filmstrip-search"/>
  <NativeInput key={active} type="text" defaultValue={(tags[active]??[]).join(', ')} aria-label={t('photos.tags.label')} title={t('photos.tags.label')} placeholder={t('photos.tags.label')} className="h-7 w-36 shrink-0" data-testid="photos-filmstrip-tags"
   onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();}}
   onBlur={e=>{const v=e.currentTarget.value.split(',');cullBatch(()=>{for(const n of selected.length>1?selected.map(p=>p.name):[active]){if(selected.length>1)cullAddTags(n,v);else cullSetTags(n,v);}});}}/> {/* batch merges, a single photo replaces */}
  <Button variant="outline" size="compact" disabled={neutral} onClick={()=>activeSession&&setCopied(extractLook(activeSession.now))} data-testid="photos-filmstrip-copy">{t('photos.filmstrip.copy')}</Button>
  <Button variant="outline" size="compact" disabled={!copied||applying||(!active&&selected.length<2)} onClick={()=>{
   if(!copied)return;
   if(selected.length>1)void applyLookToSelection(copied); // paste onto every selected photo
   else if(active)commitPhotoSettings(active,cur=>applyLook(cur,copied));
  }} data-testid="photos-filmstrip-paste">{t('photos.filmstrip.paste')}</Button>
  {selected.length>1&&<Button variant="outline" size="compact" disabled={applying||neutral} onClick={()=>void applyToSelection()} data-testid="photos-filmstrip-apply">{t('photos.filmstrip.apply',{count:selected.length})}</Button>}
  {selected.length>1&&<NativeSelect value="" disabled={applying} aria-label={t('photos.filmstrip.applyPreset')} title={t('photos.filmstrip.applyPreset')} onChange={e=>{
   const v=e.currentTarget.value;e.currentTarget.value='';
   const wb=v.startsWith('wb:')?findWbPreset(v.slice(3)):undefined;
   const look=wb?{temp:wb.temp,tint:wb.tint}:v.startsWith('user:')?userPresets.find(p=>p.id===v.slice(5))?.look:BUILT_IN_PRESETS.find(p=>p.id===v)?.look;
   if(look)void applyLookToSelection(look);
  }} className="h-7 shrink-0" data-testid="photos-filmstrip-apply-preset">
   <option value="" disabled>{t('photos.filmstrip.applyPreset')}</option>
   {BUILT_IN_PRESETS.map(p=><option key={p.id} value={p.id}>{t(p.labelKey)}</option>)}
   {WB_PRESETS.map(p=><option key={p.id} value={`wb:${p.id}`}>{t(p.labelKey)}</option>)}
   {userPresets.map(p=><option key={p.id} value={`user:${p.id}`}>{p.name}</option>)}
  </NativeSelect>}
  {onSurvey&&<Button variant="outline" size="icon" aria-label={t('photos.filmstrip.survey')} title={t('photos.filmstrip.survey')} onClick={()=>onSurvey(selected.length>1?selected.map(p=>p.name):[])} className="h-7 w-7 shrink-0" data-testid="photos-filmstrip-survey"><LayoutGrid size={12}/></Button>} {/* with a selection it surveys the selection, else the whole filtered view */}
  {rejected.length>0&&<Button variant={armRemove?'primary':'outline'} size="compact" onClick={removeRejected} className="shrink-0" data-testid="photos-filmstrip-remove-rejects"><Trash2 size={12}/>{armRemove?t('photos.filmstrip.removeRejectsConfirm',{count:rejected.length}):t('photos.filmstrip.removeRejects',{count:rejected.length})}</Button>}
  <Button variant="outline" size="icon" aria-pressed={autoAdvance} aria-label={t('photos.filmstrip.autoAdvance')} title={t('photos.filmstrip.autoAdvance')} onClick={()=>setAutoAdvance(!autoAdvance)} className="h-7 w-7 shrink-0" data-testid="photos-filmstrip-autoadvance"><SkipForward size={12}/></Button>
  {applyNote&&<span className="shrink-0 text-ink-3" data-testid="photos-filmstrip-apply-note">{applyNote}</span>}
  <RatingStars name={active} prefix="photos-filmstrip"/>
  {groupForStrip(photos.map(p=>p.name),stacks,{},covers).map(row=>{
   if(row.kind==='single')return thumb(byName(row.name));
   if(expanded[row.id])return <span key={row.id} className="flex shrink-0 items-center gap-1" data-testid={`photos-filmstrip-stack-${row.id}`} data-expanded="true">
    <Button variant="outline" size="icon" aria-label={t('photos.stacks.collapse')} title={t('photos.stacks.collapse')} onClick={()=>setExpanded({...expanded,[row.id]:false})} className="h-7 w-7 shrink-0" data-testid={`photos-filmstrip-stack-close-${row.id}`}><ChevronDown size={12}/></Button>
    {row.members.map(n=>thumb(byName(n)))}
   </span>;
   return <span key={row.id} className="relative flex shrink-0 items-center" data-testid={`photos-filmstrip-stack-${row.id}`}>
    {thumb(byName(row.members[0]))}
    <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 rounded-[2px] bg-elevated px-1 text-ink tabular-nums" data-testid={`photos-filmstrip-stack-count-${row.members[0]}`}>{row.members.length}</span>
    <Button variant="outline" size="icon" aria-label={t('photos.stacks.expand')} title={t('photos.stacks.expand')} onClick={e=>{e.stopPropagation();setExpanded({...expanded,[row.id]:true});}} className="absolute top-0.5 right-0.5 h-5 w-5" data-testid={`photos-filmstrip-stack-open-${row.id}`}><ChevronRight size={10}/></Button>
   </span>;
  })}
 </div>;
}
