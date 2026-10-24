import {auditThemeContrast,browserThemeColor} from '../lib/themeContrast';
import {useMemo,useRef,useState,useSyncExternalStore} from 'react';
import {Button} from './ui/button';
import {NativeInput,NativeSelect,Textarea} from './ui/native-controls';
import {Notice} from './ui/notice';
import {useT} from '../lib/useT';
import {parseThemeExchange} from '../lib/themeExchange';
import type {ThemeExchange} from '../lib/themeExchange';
import {importedThemeStore,importedThemePreview} from '../lib/importedTheme';
function Preview({theme,mode,label}:{theme:ThemeExchange;mode:'light'|'dark';label:string}){
 const vars=importedThemePreview(theme,mode);
 return <div data-testid={`theme-preview-${mode}`} className="theme-import-preview" style={vars}>
  <strong>{label}</strong><div className="theme-import-preview-card">{theme.name}</div><span className="theme-import-preview-action" aria-hidden="true">Aa</span>
 </div>;
}
/** Local theme data only. No network loading or registry commands. */
export function ThemeImportPanel(){
 const {t}=useT(),state=useSyncExternalStore(importedThemeStore.subscribe,importedThemeStore.getState,importedThemeStore.getState);
 const [text,setText]=useState(''),[format,setFormat]=useState<'json'|'css'>('json'),[fileError,setFileError]=useState(false);const sequence=useRef(0);
 const result=useMemo(()=>text.trim()?parseThemeExchange(text,format):null,[text,format]);
 const draft=result?.ok?result.theme:null;
 const contrast=useMemo(()=>draft&&typeof document!=='undefined'?auditThemeContrast(draft,browserThemeColor):[],[draft]);
 return <section className="theme-import-panel" data-testid="theme-import-panel" aria-label={t('themeImport.title')}>
  <h3>{t('themeImport.title')}</h3><p>{t('themeImport.note')}</p>
  <label>{t('themeImport.format')}<NativeSelect aria-label={t('themeImport.format')} value={format} onChange={e=>{sequence.current++;setFormat(e.target.value==='css'?'css':'json');}}><option value="json">JSON</option><option value="css">CSS</option></NativeSelect></label>
  <label>{t('themeImport.source')}<Textarea aria-label={t('themeImport.source')} value={text} rows={5} maxLength={65536} onChange={e=>{sequence.current++;setText(e.target.value);setFileError(false);}}/></label>
  <label>{t('themeImport.load')}<NativeInput type="file" accept=".json,.css,application/json,text/css" aria-label={t('themeImport.load')} onChange={async e=>{const file=e.currentTarget.files?.[0];e.currentTarget.value='';const request=++sequence.current;if(!file)return;if(file.size>65536){setFileError(true);return;}try{const value=await file.text();if(request!==sequence.current)return;setFormat(file.name.toLowerCase().endsWith('.css')?'css':'json');setText(value);setFileError(false);}catch{if(request===sequence.current)setFileError(true);}}}/></label>
  {fileError&&<Notice tone="danger" live="assertive">{t('themeImport.fileError')}</Notice>}
  {result&&!result.ok&&<Notice tone="danger" live="polite">{t('themeImport.invalid')}</Notice>}
  {draft&&<><div className="theme-import-previews"><Preview theme={draft} mode="light" label={t('themeImport.light')}/><Preview theme={draft} mode="dark" label={t('themeImport.dark')}/></div><p>{t('themeImport.unsupported')}</p><ul data-testid="theme-import-ignored">{draft.ignored.length?draft.ignored.map((item,index)=><li key={`${item}-${index}`}><code>{item}</code></li>):<li>{t('themeImport.none')}</li>}</ul></>}
  {draft&&contrast.length>0&&<div className="ds-notice" data-tone="warning" role="note"><span>{t('themeImport.contrastNote')}</span><ul data-testid="theme-import-contrast">{contrast.map(issue=><li key={`${issue.mode}:${issue.foreground}`}><code>{issue.mode}: {issue.foreground} / {issue.background}</code>{' '}{issue.kind==='low'?t('themeImport.contrastLow',{ratio:issue.ratio!.toFixed(2)}):t('themeImport.contrastUnknown')}</li>)}</ul></div>}
  <div className="theme-import-actions"><Button disabled={!draft||fileError} onClick={()=>{if(draft)importedThemeStore.apply(draft);}}>{t('themeImport.apply')}</Button><Button disabled={!state.canUndo} onClick={()=>importedThemeStore.undo()}>{t('themeImport.undo')}</Button><Button disabled={!state.theme} onClick={()=>importedThemeStore.reset()}>{t('themeImport.reset')}</Button></div>
  <p role="status">{state.theme?t('themeImport.active',{name:state.theme.name}):t('themeImport.default')}</p>
  {!state.persistent&&<Notice tone="warning" live="polite">{t('themeImport.sessionOnly')}</Notice>}
 </section>;
}
