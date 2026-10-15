import {useMedia} from '../../lib/media';
import {developablePhotos} from '../../lib/photos/photoNav';
import {sortFilmstrip,type FilmstripSort} from '../../lib/photos/filmstripSort';
import {useRatings} from '../../lib/photos/ratings';
import {useFlags} from '../../lib/photos/flags';
import {useLabels} from '../../lib/photos/labels';
import {usePhotoTags} from '../../lib/photos/tags';
import {useAllCaptions} from '../../lib/photos/captions';
import {ensureCaptureDates,getCaptureEntry,useCaptureDates,duplicateKey} from '../../lib/photos/captureDates';
import {photoFileType} from '../../lib/photos/fileType';
import {useEffect} from 'react';
import type {PhotoLabel} from '../../lib/photos/labels';
import {usePanelState} from '../../store/panelStateStore';
import {useHidden} from '../../lib/photos/hidden';
import {useCollectionMembers} from '../../lib/photos/collections';

/** The smart filter's rule set: an on switch plus the AND-combined rules minimum rating, flag, color label and exact keyword tag. */
export interface SmartFilter{on:boolean;minRating:number;flag:string;label:string;tag:string;camera?:string;dup?:boolean;type?:string}
/** The filmstrip's visible list: developable photos after the rating/flag/label filter and the chosen sort. Shared by the filmstrip and the live library grid. */
export function useVisiblePhotos(){
 const media=useMedia();
 const ratings=useRatings();
 const flags=useFlags();
 const labels=useLabels();
 const tags=usePhotoTags();
 const captions=useAllCaptions();
 useCaptureDates(); // re-render as EXIF dates land
 const [minRating]=usePanelState<number|string>('photos.ratingFilter',0);
 const [sort]=usePanelState<FilmstripSort>('photos.filmstripSort','library');
 const [query]=usePanelState<string>('photos.searchQuery','');
 const [smart]=usePanelState<SmartFilter>('photos.smartFilter',{on:false,minRating:0,flag:'',label:'',tag:''});
 const [showHidden]=usePanelState<boolean>('photos.showHidden',false);
 const [collection]=usePanelState<string>('photos.collection',''); // manual collection filter: '' = off
 const collectionMembers=useCollectionMembers(collection);
 const collectionSet=collection?new Set(collectionMembers):null;
 const filter=String(minRating); // legacy stored numbers and 'pick'/'reject'/'unrated'/'label:*' share one select
 const smartOn=smart.on&&(smart.minRating>0||smart.flag!==''||smart.label!==''||smart.tag.trim()!==''||(smart.camera??'').trim()!==''||!!smart.dup||(smart.type??'').trim()!=='');
 const hidden=useHidden();
 const hiddenSet=showHidden?new Set<string>():new Set(hidden);
 const total=developablePhotos(media.items).length;
 const all=developablePhotos(media.items).filter(p=>!hiddenSet.has(p.name));
 const q=query.trim().toLowerCase();
 const smartTag=smart.tag.trim();
 const smartCamera=(smart.camera??'').trim();
 const smartType=(smart.type??'').trim();
 const dupKeys=new Map<string,number>();if(smart.dup)for(const p of all){const e=getCaptureEntry(p.name,p.size);const k=e?duplicateKey(e):null;if(k)dupKeys.set(k,(dupKeys.get(k)??0)+1);}
 const visible=all.filter(p=>(!collectionSet||collectionSet.has(p.name))&&(!smartOn||((ratings[p.name]??0)>=smart.minRating&&(smart.flag===''||(smart.flag==='none'?flags[p.name]==null:flags[p.name]===smart.flag))&&(smart.label===''||(smart.label==='none'?labels[p.name]==null:labels[p.name]===smart.label))&&(smartTag===''||(tags[p.name]??[]).some(t=>t.toLowerCase()===smartTag.toLowerCase()))&&(smartCamera===''||getCaptureEntry(p.name,p.size)?.cam===smartCamera)&&(smartType===''||photoFileType(p.mime)===smartType)&&(!smart.dup||(()=>{const e=getCaptureEntry(p.name,p.size);const k=e?duplicateKey(e):null;return k!==null&&(dupKeys.get(k)??0)>1;})())))); // unresolved entries match neither a camera rule nor the duplicates rule
 const developable=developablePhotos(media.items);
 const developableKey=developable.map(p=>`${p.name}:${p.size}`).join('|');
 useEffect(()=>{if(sort==='capture'||smartCamera!==''||smart.dup)ensureCaptureDates(developable);},[sort,developableKey,smartCamera,smart.dup]); // eslint-disable-line react-hooks/exhaustive-deps -- the key is the stable identity of the list
 const captureReady=sort==='capture'&&developable.every(p=>getCaptureEntry(p.name,p.size)!==null); // flip to date order only once everything resolved: no progressive jumping
 const dates:Record<string,number|null>={};if(captureReady)for(const p of developable)dates[p.name]=getCaptureEntry(p.name,p.size)!.t;
 const effectiveSort=sort==='capture'&&!captureReady?'library':sort;
 const photos=sortFilmstrip(visible.filter(p=>q&&!(p.name.toLowerCase().includes(q)||(tags[p.name]??[]).some(t=>t.toLowerCase().includes(q))||(captions[p.name]??'').toLowerCase().includes(q))?false:filter==='pick'?flags[p.name]==='pick':filter==='reject'?flags[p.name]==='reject':filter==='unrated'?!(ratings[p.name]>=1):filter.startsWith('label:')?labels[p.name]===filter.slice(6):filter.startsWith('tag:')?(tags[p.name]??[]).includes(filter.slice(4)):(ratings[p.name]??0)>=Number(smartOn?0:filter)),effectiveSort,ratings,flags,dates); // sorting is display-only, prev/next keeps library order
 return {photos,all,total,ratings,flags,labels,tags,filter,sort,query,smart,smartOn,hidden,showHidden,collection};
}
