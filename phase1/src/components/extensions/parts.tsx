import {useId,useState,type ReactNode} from 'react';
import {useT} from '../../lib/useT';
import {badgeText,permissionTags,type GrantKey,type PopupExtension,type PopupView} from '../../lib/extensions/popupModel';

/** Icon from api.iconify.design/vadivam/badge-check.svg, inlined so no network fetch is needed. */
export function VerifiedBadge({criterion,size=18}:{criterion:string;size?:number}){
 return <span className="ext-badge" role="img" aria-label={criterion} title={criterion}>
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"><path d="m9.594 3.198l-.001.002a3.48 3.48 0 0 1-2.112.874c-.802.064-1.203.097-1.537.215a2.72 2.72 0 0 0-1.655 1.654c-.118.335-.15.736-.215 1.537c-.065.825-.327 1.47-.874 2.112l-.001.002c-.52.61-.782.917-.934 1.237a2.72 2.72 0 0 0-.001 2.339c.153.32.414.626.937 1.238c.52.585.829 1.329.873 2.111c.065.802.097 1.203.215 1.537a2.72 2.72 0 0 0 1.654 1.655c.335.118.736.15 1.537.215a3.47 3.47 0 0 1 2.113.875c.611.52.918.782 1.238.934a2.72 2.72 0 0 0 2.339 0c.32-.152.626-.413 1.238-.936c.63-.536 1.27-.807 2.111-.873c.802-.064 1.204-.097 1.537-.215a2.72 2.72 0 0 0 1.655-1.654c.118-.335.15-.736.215-1.537a3.48 3.48 0 0 1 .875-2.112v-.002c.521-.61.782-.917.934-1.237a2.71 2.71 0 0 0 0-2.338c-.152-.32-.413-.627-.936-1.239c-.536-.63-.807-1.269-.873-2.111c-.064-.802-.097-1.203-.215-1.537a2.71 2.71 0 0 0-1.654-1.655c-.334-.118-.736-.15-1.537-.215c-.842-.066-1.482-.338-2.112-.874l-.002-.002c-.61-.52-.917-.78-1.236-.933a2.72 2.72 0 0 0-2.34 0c-.32.152-.626.413-1.236.933" /><path d="m8.5 12.571l2.188 1.929s2.67-3.6 4.812-4.5" /></g></svg></span>;
}
/** 38x22 drawn switch inside a 40px target. Not nested in any card button. */
export function Switch({checked,label,onChange,disabled,busy}:{checked:boolean;label:string;onChange:(next:boolean)=>void;disabled?:boolean;busy?:boolean}){
 return <button type="button" role="switch" aria-checked={checked} aria-label={label} aria-busy={busy||undefined} disabled={disabled||busy} className="ext-switch" onClick={()=>onChange(!checked)}><span aria-hidden="true" className="ext-switch-track"><span className="ext-switch-thumb"/></span></button>;
}
export function Logo({name,size=48}:{name:string;size?:number}){
 const hue=[...name].reduce((a,c)=>a+c.charCodeAt(0),0)%360;
 return <span className="ext-logo" aria-hidden="true" style={{width:size,height:size,fontSize:size*0.42,background:`hsl(${hue} 62% 46%)`}}>{name.trim().charAt(0).toUpperCase()||'?'}</span>;
}
export function ExtensionIdentity({ext,size=48,badgeSize=18,children}:{ext:Pick<PopupExtension,'name'|'badge'|'version'>;size?:number;badgeSize?:number;children?:ReactNode}){
 return <div className="ext-identity"><Logo name={ext.name} size={size}/><div className="ext-identity-text"><div className="ext-name-row"><h3 className="ext-name">{ext.name}</h3>{ext.badge?<VerifiedBadge criterion={ext.badge.criterion} size={badgeSize}/>:null}<span className="ext-version">{ext.version}</span></div>{children}</div></div>;
}
/** Exactly one of these per visible popup. */
export function NetworkNotice({onViewActivity}:{onViewActivity:()=>void}){
 const {t}=useT();
 return <div className="ext-notice" role="note"><span>{t('ext.notice')}</span><button type="button" className="ext-link" onClick={onViewActivity}>{t('ext.notice.view')}</button></div>;
}
export function ExtensionNav({view,counts,onSelect,onAdd}:{view:PopupView;counts:{installed:number;updates:number};onSelect:(v:PopupView)=>void;onAdd:()=>void}){
 const {t}=useT();
 const items:{id:PopupView;label:string;n:number}[]=[{id:'installed',label:t('ext.nav.installed'),n:counts.installed},{id:'browse',label:t('ext.nav.browse'),n:0},{id:'updates',label:t('ext.nav.updates'),n:counts.updates},{id:'activity',label:t('ext.nav.activity'),n:0}];
 const current=view==='detail'?'installed':view==='store-detail'?'browse':view==='add'?null:view;
 return <nav className="ext-nav" aria-label={t('ext.nav.aria')}><h2 className="ext-nav-title">{t('ext.title')}</h2>
  <div role="tablist" aria-orientation="vertical" className="ext-nav-list">{items.map(i=>{const b=badgeText(i.n);return <button key={i.id} role="tab" id={`ext-tab-${i.id}`} aria-selected={current===i.id} aria-controls="ext-panel" tabIndex={current===i.id||(current===null&&i.id==='installed')?0:-1} className="ext-nav-item" onClick={()=>onSelect(i.id)}><span>{i.label}</span>{b?<span className="ext-count" aria-label={t('ext.count.aria',{count:i.n})}>{b}</span>:null}</button>;})}</div>
  <button type="button" className={`ext-add-btn${view==='add'?' is-active':''}`} onClick={onAdd}>{t('ext.add.button')}</button></nav>;
}
const TAG_KEYS:Record<GrantKey,string>={'project.read':'ext.tag.read','project.write':'ext.tag.write',network:'ext.tag.network',clipboard:'ext.tag.clipboard',folders:'ext.tag.folders',agent:'ext.tag.agent'};
export function PermissionTags({ext,onOverflow}:{ext:PopupExtension;onOverflow:()=>void}){
 const {t}=useT();const {tags,overflow,none}=permissionTags(ext);
 const contrib=ext.contributions.filter(c=>c!=='snippets'||true);
 return <div className="ext-tags">
  {none?<span className="ext-tag ext-tag-ok">{t('ext.tag.none')}</span>:tags.map(g=><span key={g.key} className={`ext-tag ${g.key==='project.write'?'ext-tag-warn':'ext-tag-perm'}`}>{g.key==='network'?t('ext.tag.networkN',{count:g.count??1}):t(TAG_KEYS[g.key as GrantKey])}</span>)}
  {overflow>0?<button type="button" className="ext-tag ext-tag-more" aria-label={t('ext.tag.moreAria',{count:overflow})} onClick={onOverflow}>+{overflow}</button>:null}
  {contrib.map(c=><span key={c} className="ext-tag">{t(`ext.contrib.${c}`)}</span>)}
 </div>;
}
export function useInlineError(){const [error,setError]=useState<string|null>(null);const id=useId();return {error,setError,id};}
export function InlineError({id,message}:{id:string;message:string|null}){return message?<p id={id} role="alert" className="ext-error">{message}</p>:null;}
/** Localised action label from the canonical API name; unknown names show the canonical name, never free-form extension text. */
export function useApiLabel(){const {t}=useT();return (api:string)=>{const k=`ext.api.${api}`;const v=t(k);return v===k?api:v;};}
