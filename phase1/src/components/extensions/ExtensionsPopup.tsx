import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {X} from 'lucide-react';
import {Dialog,DialogContent,DialogTitle} from '../ui/dialog';
import {useT} from '../../lib/useT';
import type {ExtensionsPopupHost} from '../../lib/extensions/popupHost';
import {navCounts,type ChipId,type LogState,type PopupExtension,type PopupView,type StateFilter} from '../../lib/extensions/popupModel';
import type {ActivityEvent} from '../../lib/extensions/securityActivity';
import {ExtensionNav,NetworkNotice} from './parts';
import {DetailView,InstalledView,UpdatePanel,ExtensionCard} from './InstalledDetail';
import {ActivityView,BrowseView,ExtensionCandidateInput} from './AddBrowseActivity';
import {StoreScreen} from './StoreView';

type Entry={view:PopupView;id?:string;section?:string};
/** Own dialog for extension management. Host truth is re-read after every acknowledged mutation. */
export function ExtensionsPopup({open,onClose,host,initial='installed'}:{open:boolean;onClose:()=>void;host:ExtensionsPopupHost;initial?:PopupView}){
 return <Dialog open={open} onOpenChange={o=>{if(!o)onClose();}}><DialogContent className="ext-popup" aria-label="Extensions"><ExtensionsPopupBody host={host} onClose={onClose} initial={initial}/></DialogContent></Dialog>;
}

export function ExtensionsPopupBody({host,onClose,initial='installed'}:{host:ExtensionsPopupHost;onClose:()=>void;initial?:PopupView}){
 const {t}=useT();
 const [stack,setStack]=useState<Entry[]>([{view:initial}]);const cur=stack[stack.length-1];
 const [list,setList]=useState<PopupExtension[]|null>(null);const [loadError,setLoadError]=useState(false);
 const [query,setQuery]=useState('');const [filter,setFilter]=useState<StateFilter>('all');
 const [actInit,setActInit]=useState<{extensionId:string|null;chip:ChipId}>({extensionId:null,chip:'all'});
 const [actKey,setActKey]=useState(0);
 const [detailLog,setDetailLog]=useState<{events:ActivityEvent[];state:LogState}>({events:[],state:{status:'loading'}});
 const body=useRef<HTMLDivElement>(null);
 const refresh=useCallback(async()=>{try{setList(await host.list());setLoadError(false);}catch{setLoadError(true);}},[host]);
 useEffect(()=>{void refresh();},[refresh]);
 const go=(e:Entry)=>setStack(s=>[...s,e]);
 const select=(v:PopupView)=>setStack([{view:v}]);
 const back=()=>setStack(s=>s.length>1?s.slice(0,-1):s);
 const goActivity=(extensionId:string|null,chip:ChipId='all')=>{setActInit({extensionId,chip});setActKey(k=>k+1);select('activity');};
 const detail=cur.view==='detail'?list?.find(e=>e.id===cur.id)??null:null;
 useEffect(()=>{if(cur.view!=='detail'||!cur.id)return;let live=true;setDetailLog({events:[],state:{status:'loading'}});host.queryActivity({extensionId:cur.id},0,3).then(p=>{if(live)setDetailLog({events:p.events,state:{status:'ready',events:p.events,nextOffset:p.nextOffset,total:p.total}});}).catch(()=>{if(live)setDetailLog({events:[],state:{status:'error'}});});return()=>{live=false;};},[host,cur.view,cur.id,list]);
 const counts=useMemo(()=>navCounts(list??[]),[list]);
 useEffect(()=>{body.current?.scrollTo?.({top:0});},[cur.view,cur.id]);
 const heading=cur.view==='store-detail'?'':cur.view==='add'?t('ext.add.title'):cur.view==='installed'?t('ext.installed.title'):cur.view==='browse'?(host.store?t('store.title'):t('ext.nav.browse')):cur.view==='updates'?t('ext.nav.updates'):cur.view==='activity'?t('ext.nav.activity'):'';
 return <div className="ext-shell">
  <ExtensionNav view={cur.view} counts={counts} onSelect={select} onAdd={()=>select('add')}/>
  <div className="ext-main">
   <header className="ext-header">{cur.view==='detail'||cur.view==='store-detail'?<span/>:<DialogTitle render={<h2 className="ext-h1"/>}>{heading}</DialogTitle>}{cur.view==='detail'||cur.view==='store-detail'?<DialogTitle className="sr-only">{detail?.name??t('ext.title')}</DialogTitle>:null}<button type="button" className="ext-close" aria-label={t('ext.close')} onClick={onClose}><X size={18} aria-hidden="true"/></button></header>
   <NetworkNotice onViewActivity={()=>goActivity(null,'network')}/>
   <div className="ext-body" id="ext-panel" role="tabpanel" aria-labelledby={cur.view==='detail'||cur.view==='store-detail'||cur.view==='add'?undefined:`ext-tab-${cur.view}`} ref={body}>
    {loadError?<div className="ext-callout ext-callout-error" role="alert">{t('ext.error.load')} <button type="button" className="ext-link" onClick={refresh}>{t('ext.retry')}</button></div>
     :list===null&&cur.view!=='browse'&&cur.view!=='add'&&cur.view!=='activity'?<p className="ext-meta ext-pad" role="status">{t('ext.loading')}</p>
     :cur.view==='installed'?<InstalledView list={list!} host={host} query={query} setQuery={setQuery} filter={filter} setFilter={setFilter} onOpen={(id,section)=>go({view:'detail',id,section})} onBrowse={()=>select('browse')} onAdd={()=>select('add')} onChanged={refresh}/>
     :cur.view==='detail'?(detail?<DetailView key={detail.id} ext={detail} host={host} log={detailLog} focusSection={cur.section} onBack={back} onChanged={refresh} onActivity={()=>goActivity(detail.id)} onRemoved={()=>{select('installed');void refresh();}}/>:<div className="ext-empty"><h3>{t('ext.detail.gone')}</h3><button type="button" className="ext-btn" onClick={()=>select('installed')}>{t('ext.back.installed')}</button></div>)
     :cur.view==='updates'?<UpdatesView list={list??[]} host={host} onChanged={refresh} onOpen={id=>go({view:'detail',id})}/>
     :(cur.view==='browse'||cur.view==='store-detail')&&host.store?<StoreScreen host={host} store={host.store} installed={list??[]} detailId={cur.view==='store-detail'?cur.id??null:null} onOpen={id=>go({view:'store-detail',id})} onOpenInstalled={id=>go({view:'detail',id})} onBack={back} onActivity={id=>goActivity(id)} onChanged={()=>void refresh()}/>
     :cur.view==='browse'?<BrowseView host={host} installedIds={(list??[]).map(e=>e.id)} onOpenInstalled={id=>go({view:'detail',id})} onReviewUpdate={id=>go({view:'detail',id})} onInstalled={()=>{void refresh();select('installed');}}/>
     :cur.view==='add'?<ExtensionCandidateInput host={host} onInstalled={()=>{void refresh();select('installed');}}/>
     :<ActivityView key={actKey} host={host} installed={list??[]} initial={actInit}/>}
   </div>
  </div>
 </div>;
}

function UpdatesView({list,host,onChanged,onOpen}:{list:PopupExtension[];host:ExtensionsPopupHost;onChanged:()=>void;onOpen:(id:string)=>void}){
 const {t}=useT();const pending=list.filter(e=>e.update.kind==='consent'||e.status==='update-consent');
 if(pending.length===0)return <div className="ext-empty"><h3>{t('ext.updates.none')}</h3><p>{t('ext.updates.none.body')}</p></div>;
 return <div className="ext-view"><ul className="ext-grid">{pending.map(e=><li key={e.id} className="ext-card ext-card-update"><button type="button" className="ext-link ext-update-name" onClick={()=>onOpen(e.id)}>{e.name} {e.version}</button><UpdatePanel ext={e} host={host} onChanged={onChanged}/></li>)}</ul></div>;
}
export {ExtensionCard};
