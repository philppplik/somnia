import {useCallback,useEffect,useState} from 'react';
import {bundleDiff,scanSummary,trustBadge} from '../../lib/vibespace/skills';
import type {BundleDiff,IndexEntry,SkillScope,SkillSummary,SkillVersion,SkillsTransport} from '../../lib/vibespace/skills';
import {parseSkillsIndex} from '../../lib/vibespace/skills';
import {ms} from '../../lib/vibespace/i18nMemorySkills';
import './memory-skills.css';
/** Skills of one Vibe Space + user-wide. Installing never runs anything; allowed-tools is only shown as requested. */
export function SkillsTab({transport,spaceId,locale='en'}:{transport:SkillsTransport;spaceId:string;locale?:string}){
 const t=(k:Parameters<typeof ms>[1],p?:Record<string,string|number>)=>ms(locale,k,p);
 const [skills,setSkills]=useState<SkillSummary[]>([]),[error,setError]=useState<string|null>(null),[open,setOpen]=useState<string|null>(null),[detail,setDetail]=useState<SkillVersion|null>(null),[review,setReview]=useState<{id:string;diff:BundleDiff}|null>(null);
 const [md,setMd]=useState(''),[scope,setScope]=useState<SkillScope>('space'),[index,setIndex]=useState<IndexEntry[]|null>(null);
 const guard=useCallback(async(f:()=>Promise<unknown>)=>{setError(null);try{await f();}catch(e){setError(e instanceof Error?e.message:String(e));}},[]);
 const refresh=useCallback(()=>guard(async()=>setSkills(await transport.list(spaceId))),[guard,transport,spaceId]);
 useEffect(()=>{void refresh();},[refresh]);
 const view=(s:SkillSummary)=>guard(async()=>{if(open===s.id){setOpen(null);setDetail(null);return;}setDetail(await transport.getVersion(s.id,s.activeVersion));setOpen(s.id);});
 const startReview=(s:SkillSummary)=>guard(async()=>{const [a,b]=await Promise.all([transport.getVersion(s.id,s.activeVersion),transport.getVersion(s.id,s.latestVersion)]);if(!a||!b)throw new Error('Version not found.');setReview({id:s.id,diff:bundleDiff(a,b)});});
 const sorted=[...skills].sort((a,b)=>a.scope===b.scope?a.name.localeCompare(b.name):a.scope==='space'?-1:1);
 return <section className="vsx" aria-label={t('vsk.title')}>
  <div><h2>{t('vsk.title')}</h2><p className="vsx-muted">{t('vsk.intro')}</p></div>
  {error&&<div className="vsx-card vsx-error" role="alert"><strong>{t('vsk.error')}</strong><p className="vsx-muted" data-copyable>{error}</p></div>}
  <form className="vsx-card" onSubmit={e=>{e.preventDefault();void guard(async()=>{await transport.install({scope,spaceId:scope==='space'?spaceId:null,source:'local',sourceRef:null,skillMd:md,files:[]});setMd('');await refresh();});}}>
   <h3>{t('vsk.install')}</h3>
   <textarea aria-label={t('vsk.install.skillmd')} placeholder={t('vsk.install.skillmd')} value={md} onChange={e=>setMd(e.target.value)}/>
   <div className="vsx-row"><label>{t('vsk.install.scope')} <select aria-label={t('vsk.install.scope')} value={scope} onChange={e=>setScope(e.target.value as SkillScope)}><option value="space">{t('vsk.scope.space')}</option><option value="user">{t('vsk.scope.user')}</option></select></label>
    <button type="submit" disabled={!md.trim()}>{t('vsk.install.go')}</button></div>
   <p className="vsx-muted">{t('vsk.install.note')}</p>
  </form>
  <div className="vsx-card">
   {sorted.length===0?<p className="vsx-muted">{t('vsk.empty')}</p>:<ul style={{listStyle:'none',padding:0,margin:0,display:'flex',flexDirection:'column',gap:8}}>{sorted.map(s=>{const b=trustBadge(s.trust);return <li key={s.id} className="vsx-card" data-skill={s.name}>
    <div className="vsx-row"><b>{s.name}</b><span className="vsx-badge" data-tone={b.tone}>{t(`vsk.trust.${s.trust}` as 'vsk.trust.scanned')}</span><span className="vsx-muted">{t(`vsk.scope.${s.scope}` as 'vsk.scope.space')}</span>{s.pinnedCommit&&<span className="vsx-muted">{t('vsk.pinned',{commit:s.pinnedCommit.slice(0,7)})}</span>}</div>
    <p style={{margin:0}}>{s.description}</p>
    {s.trust==='unreviewed'&&<p className="vsx-muted" role="note">{t('vsk.banner.unreviewed')}</p>}
    <p className="vsx-muted">{t('vsk.scripts.off')}</p>
    <div className="vsx-row"><button type="button" onClick={()=>void view(s)}>{open===s.id?t('vsk.hide'):t('vsk.view')}</button>
     {s.updatePending&&<button type="button" onClick={()=>void startReview(s)}>{t('vsk.update.review')}</button>}
     <button type="button" onClick={()=>void guard(async()=>{await transport.uninstall(s.id);await refresh();})}>{t('vsk.uninstall')}</button></div>
    {s.updatePending&&<p className="vsx-muted" role="status">{t('vsk.update')}</p>}
    {open===s.id&&detail&&<div>
     {detail.requestedTools.length>0&&<p className="vsx-muted">{t('vsk.requested',{tools:detail.requestedTools.join(', ')})}</p>}
     <ScanLine v={detail} t={t}/>
     <pre aria-label="SKILL.md">{detail.skillMd}</pre>
     {detail.files.map(f=><details key={f.path}><summary>{f.path}</summary><pre>{f.content}</pre></details>)}
    </div>}
    {review?.id===s.id&&<div className="vsx-card" aria-label={t('vsk.update.review')}>
     <h3>{t('vsk.update.review')}</h3>
     <pre aria-label="SKILL.md diff">{review.diff.skillMd.map((l,i)=><span key={i} className={`vsx-diff-${l.kind}`}>{l.kind==='add'?'+ ':l.kind==='del'?'- ':'  '}{l.text}</span>)}</pre>
     {review.diff.changedFiles.length>0&&<><h3>{t('vsk.update.files')}</h3>{review.diff.changedFiles.map(f=><details key={f.path} open><summary>{f.path} ({f.status})</summary><pre>{f.lines.map((l,i)=><span key={i} className={`vsx-diff-${l.kind}`}>{l.kind==='add'?'+ ':l.kind==='del'?'- ':'  '}{l.text}</span>)}</pre></details>)}</>}
     {review.diff.newFindings.length>0&&<><h3>{t('vsk.update.newFindings')}</h3><ul>{review.diff.newFindings.map((f,i)=><li key={i}>{f.severity}: {f.rule} · {f.file}:{f.line}</li>)}</ul></>}
     {review.diff.toolsAdded.length>0&&<p className="vsx-muted">{t('vsk.update.newTools')}: {review.diff.toolsAdded.join(', ')}</p>}
     <div className="vsx-row"><button type="button" onClick={()=>void guard(async()=>{await transport.acceptUpdate(s.id);setReview(null);await refresh();})}>{t('vsk.update.accept')}</button>
      <button type="button" onClick={()=>void guard(async()=>{await transport.rejectUpdate(s.id);setReview(null);await refresh();})}>{t('vsk.update.reject')}</button></div>
    </div>}
   </li>;})}</ul>}
  </div>
  <div className="vsx-card"><h3>{t('vsk.index')}</h3>
   {transport.fetchIndex?<><button type="button" onClick={()=>void guard(async()=>setIndex(parseSkillsIndex(await transport.fetchIndex!(true))))}>{t('vsk.index.consent')}</button>
    {index&&<ul>{index.map(e=><li key={e.repo+e.name}><b>{e.name}</b> <span className="vsx-muted">{e.repo}</span> {e.description}</li>)}</ul>}</>
    :<p className="vsx-muted">{t('vsk.index.unavailable')}</p>}
  </div>
 </section>;
}
function ScanLine({v,t}:{v:SkillVersion;t:(k:Parameters<typeof ms>[1],p?:Record<string,string|number>)=>string}){
 const s=scanSummary(v.scan);
 const head=s.high?t('vsk.scan.serious',{count:s.high}):s.medium?t('vsk.scan.notes',{count:s.medium}):t('vsk.scan.clean');
 return <div><p role="status"><b>{head}</b> <span className="vsx-muted">{t('vsk.scan.caveat')}</span></p>
  {v.scan.findings.length>0&&<ul>{v.scan.findings.map((f,i)=><li key={i}><code>{f.rule}</code> {f.file}:{f.line} <span className="vsx-muted">{f.excerpt}</span></li>)}</ul>}</div>;
}
