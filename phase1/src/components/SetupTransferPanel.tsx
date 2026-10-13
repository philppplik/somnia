import {useRef,useState} from 'react';
import {useT} from '../lib/useT';
import {downloadText} from '../lib/exportProject';
import {listCommands,setShortcutOverride,shortcutOverrides} from '../lib/commands';
import {SETTINGS_REGISTRY,displayValue,type StateLike} from '../lib/settingsRegistry';
import {buildSetup,parseSetup,SETUP_FILE_SUFFIX,type ParseOutcome} from '../lib/settingsTransfer/format';
import {coverageReport,DEFAULT_CATEGORIES,TRANSFER_CATEGORIES,type TransferCategory} from '../lib/settingsTransfer/classify';
import {planImport,type ImportMode,type Plan,type PlanRow} from '../lib/settingsTransfer/plan';
import {applyChange,buildChange,restoreChange,type Adapters,type Resolution,type Snapshot} from '../lib/settingsTransfer/apply';
import {latestSnapshot,removeSnapshot,saveSnapshot,settingsPatch} from '../lib/settingsTransfer/host';
type Parsed=Extract<ParseOutcome,{ok:true}>;
const kv=()=>localStorage;
/**
 * Settings > Modified: export a setup file, review an import (Merge / Replace, per category and per row), apply with a
 * restore point and roll back on failure. Pure logic lives in lib/settingsTransfer; this component only renders it.
 * Desktop and web use the same flow (file picker + download).
 */
export function SetupTransferPanel({state,onApply}:{state:StateLike;onApply(patch:Record<string,unknown>):void}){
 const {t}=useT();const file=useRef<HTMLInputElement>(null);
 const [cats,setCats]=useState<TransferCategory[]>([...DEFAULT_CATEGORIES]);const [label,setLabel]=useState('');
 const [parsed,setParsed]=useState<Parsed|null>(null);const [mode,setMode]=useState<ImportMode>('merge');
 const [icats,setIcats]=useState<TransferCategory[]>([]);const [off,setOff]=useState<Set<string>>(new Set());
 const [res,setRes]=useState<Record<string,Resolution>>({});const [ack,setAck]=useState(false);
 const [note,setNote]=useState('');const [busy,setBusy]=useState(false);const [undoable,setUndoable]=useState<Snapshot|undefined>(()=>{try{return latestSnapshot(kv());}catch{return undefined;}});
 const target=()=>({state,shortcuts:shortcutOverrides()});
 const known=()=>listCommands().map(c=>c.id);
 const plan:Plan|null=parsed?planImport(parsed.setup,target(),{mode,categories:icats}):null;
 const toggle=<T,>(list:T[],v:T)=>list.includes(v)?list.filter(x=>x!==v):[...list,v];
 const cov=coverageReport();const excluded=Object.values(cov.excluded).reduce((a,b)=>a+b,0);

 const doExport=()=>{const text=buildSetup({state,shortcuts:shortcutOverrides(),categories:cats,label});const n=Object.keys(JSON.parse(text).categories.settings?.values??{}).length+Object.keys(JSON.parse(text).categories.keybindings?.common??{}).length;
  downloadText(text,(label.trim().replace(/[^\p{L}\p{N}_-]+/gu,'-').replace(/^-+|-+$/g,'')||'my-setup')+SETUP_FILE_SUFFIX,'application/json');setNote(t('settings.transfer.exported',{n}));};
 const open=async(f:File|undefined)=>{if(!f)return;setNote('');setParsed(null);
  if(f.size>1024*1024){setNote(t('settings.transfer.err.too-large'));return;}
  const r=parseSetup(await f.text(),known());
  if(!r.ok){setNote(t('settings.transfer.err.'+r.code));return;}
  setParsed(r);setMode('merge');setIcats([...r.setup.categories]);setOff(new Set());setRes({});setAck(false);};
 const cancel=()=>{setParsed(null);setNote('');};
 const adapters=():Adapters=>({
  async saveSnapshot(s){saveSnapshot(kv(),s);},
  async writeSettings(values){onApply(settingsPatch(state,values));},
  async writeShortcuts(map){for(const [id,v] of Object.entries(map))setShortcutOverride(id,v===null?null:v);},
 });
 const apply=async()=>{if(!plan||!parsed)return;setBusy(true);setNote('');try{
  const keys=new Set(plan.rows.filter(r=>!off.has(r.key)).map(r=>r.key));
  const c=buildChange(plan,target(),{selectedKeys:keys,resolutions:res,acknowledgedResets:ack?plan.rows.filter(r=>keys.has(r.key)&&r.status==='reset').length:undefined});
  if(!c.ok){setNote(t('settings.transfer.err.'+c.code));if(c.code==='stale')setParsed({...parsed});return;}
  const o=await applyChange(c.change,target(),adapters(),Date.now());
  if(o.status==='applied'){setUndoable(o.snapshot);setParsed(null);setNote(t('settings.transfer.applied',{n:c.applied}));}
  else if(o.status==='blocked')setNote(t('settings.transfer.err.backup'));
  else if(o.status==='rolled-back')setNote(t('settings.transfer.err.rolledBack'));
  else setNote(t('settings.transfer.err.rollbackFailed'));
 }finally{setBusy(false);}};
 const undo=async()=>{if(!undoable)return;setBusy(true);try{
  const r=restoreChange(undoable,target());
  if(!r.differing){removeSnapshot(kv(),undoable.createdAt);setUndoable(latestSnapshot(kv()));setNote(t('settings.transfer.undone'));return;}
  const o=await applyChange(r.change,target(),adapters(),Date.now());
  if(o.status==='applied'){removeSnapshot(kv(),undoable.createdAt);setUndoable(latestSnapshot(kv()));setNote(t('settings.transfer.undone'));}
  else setNote(t(o.status==='blocked'?'settings.transfer.err.backup':o.status==='rolled-back'?'settings.transfer.err.rolledBack':'settings.transfer.err.rollbackFailed'));
 }finally{setBusy(false);}};
 const name=(r:PlanRow)=>r.kind==='setting'?t(SETTINGS_REGISTRY.find(e=>e.id===r.id)!.labelKey):r.id;
 const show=(r:PlanRow,v:unknown)=>v===undefined?t('settings.transfer.notSet'):r.kind==='shortcut'?(v===''?t('settings.transfer.unbound'):String(v)):typeof v==='boolean'?t(v?'settings.modified.on':'settings.modified.off'):displayValue(v);
 const selCount=plan?plan.rows.filter(r=>!off.has(r.key)&&r.status!=='same'&&(r.status!=='conflict'||res[r.key]==='replace')).length:0;
 const resets=plan?plan.rows.filter(r=>!off.has(r.key)&&r.status==='reset').length:0;
 return <section className="settings-transfer-panel" data-testid="setup-transfer">
  <h3>{t('settings.transfer.title')}</h3><p>{t('settings.transfer.hint')}</p>
  {!parsed&&<>
   <fieldset><legend>{t('settings.transfer.exportTitle')}</legend>
    {TRANSFER_CATEGORIES.map(c=><label key={c} style={{display:'block'}}><input type="checkbox" data-testid={`export-cat-${c}`} checked={cats.includes(c)} onChange={()=>setCats(toggle(cats,c))}/> {t('settings.transfer.cat.'+c)}</label>)}
    <label>{t('settings.transfer.label')} <input type="text" maxLength={80} value={label} onChange={e=>setLabel(e.target.value)} data-testid="export-label"/></label>
    <p className="settings-modified-note">{t('settings.transfer.coverage',{n:excluded})}</p>
   </fieldset>
   <div className="settings-modified-tools">
    <button type="button" data-testid="setup-export" disabled={!cats.length||busy} onClick={doExport}>{t('settings.transfer.export')}</button>
    <button type="button" data-testid="setup-import" disabled={busy} onClick={()=>file.current?.click()}>{t('settings.transfer.import')}</button>
    {undoable&&<button type="button" data-testid="setup-undo" disabled={busy} onClick={undo}>{t('settings.transfer.undo')}</button>}
    <input ref={file} type="file" accept=".json,application/json" hidden aria-label={t('settings.transfer.import')} data-testid="setup-import-file" onChange={e=>{const f=e.currentTarget.files?.[0];e.currentTarget.value='';void open(f);}}/>
   </div>
  </>}
  {parsed&&plan&&<div data-testid="setup-review">
   <h4>{t('settings.transfer.review')}{parsed.setup.label?`: ${parsed.setup.label}`:''}</h4>
   {parsed.setup.legacy&&<p className="settings-modified-note">{t('settings.transfer.legacy')}</p>}
   {parsed.skipped.length>0&&<p className="settings-modified-note" data-testid="setup-skipped">{t('settings.transfer.skipped',{n:parsed.skipped.length})}</p>}
   <fieldset><legend>{t('settings.transfer.mode')}</legend>
    <label><input type="radio" name="setup-mode" checked={mode==='merge'} onChange={()=>{setMode('merge');setAck(false);}} data-testid="mode-merge"/> {t('settings.transfer.merge')}</label>
    <label><input type="radio" name="setup-mode" checked={mode==='replace'} onChange={()=>{setMode('replace');setOff(new Set());}} data-testid="mode-replace"/> {t('settings.transfer.replace')}</label>
   </fieldset>
   <fieldset><legend>{t('settings.transfer.categories')}</legend>
    {TRANSFER_CATEGORIES.map(c=><label key={c} style={{display:'block'}}><input type="checkbox" checked={icats.includes(c)} disabled={mode==='merge'&&!parsed.setup.categories.includes(c)} onChange={()=>{setIcats(toggle(icats,c));setAck(false);}} data-testid={`import-cat-${c}`}/> {t('settings.transfer.cat.'+c)}</label>)}
   </fieldset>
   <ul data-testid="setup-rows">{plan.rows.map(r=><li key={r.key} data-testid={`row-${r.key}`} data-status={r.status}>
    <label><input type="checkbox" checked={!off.has(r.key)} disabled={r.status==='same'} onChange={()=>setOff(new Set(toggle([...off],r.key)))}/> <strong>{name(r)}</strong></label>{' '}
    <span>{show(r,r.current)} → {show(r,r.status==='reset'?r.proposed??undefined:r.incoming)}</span>{' '}
    <span className="settings-chip">{t('settings.transfer.status.'+r.status)}</span>
    {r.status==='conflict'&&<label> <select value={res[r.key]??'skip'} onChange={e=>setRes({...res,[r.key]:e.target.value as Resolution})} aria-label={t('settings.transfer.conflict',{c:(r.conflictsWith??[]).join(', ')})}><option value="skip">{t('settings.transfer.resolveSkip')}</option><option value="replace">{t('settings.transfer.resolveReplace',{c:(r.conflictsWith??[]).join(', ')})}</option></select></label>}
   </li>)}</ul>
   {!plan.rows.length&&<p>{t('settings.transfer.nothing')}</p>}
   {mode==='replace'&&resets>0&&<label style={{display:'block'}}><input type="checkbox" checked={ack} onChange={e=>setAck(e.target.checked)} data-testid="setup-ack"/> {t('settings.transfer.ack',{n:resets})}</label>}
   <div className="settings-modified-tools">
    <button type="button" data-testid="setup-apply" disabled={busy||!selCount||(mode==='replace'&&resets>0&&!ack)} onClick={apply}>{t('settings.transfer.apply',{n:selCount})}</button>
    <button type="button" data-testid="setup-cancel" disabled={busy} onClick={cancel}>{t('settings.transfer.cancel')}</button>
   </div>
  </div>}
  {note&&<p role="status" data-testid="setup-note">{note}</p>}
 </section>;
}
