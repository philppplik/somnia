import {useState} from 'react';
import {Menu} from '@base-ui/react/menu';
import {Bold,Italic,Link as LinkIcon,Code,List,ListChecks,Ellipsis,Link2} from 'lucide-react';
import type {EditorView} from '@codemirror/view';
import {Button} from './ui/button';
import {ConfirmShell} from './ConfirmShell';
import {runMdCommand,insertLink,type MdCommand} from '../lib/mdFormat';
import {useMdSource} from '../lib/mdBridge';
import {useAppStore} from '../store/appStore';
import {formatShortcut} from '../lib/commands';
import {useT} from '../lib/useT';
type Pending={kind:'link';range:{from:number;to:number};text:string}|{kind:'code'};
/** Compact header of the Markdown source pane: label, six icon actions, More. Buttons never take focus from the editor, so the selection stays. */
export function MarkdownToolbar({view}:{view:EditorView|null}){
 const {t}=useT();const files=useAppStore().files;const [pending,setPending]=useState<Pending|null>(null);const [url,setUrl]=useState('');const [text,setText]=useState('');const [lang,setLang]=useState('');
 const live=useMdSource()??view;
 const run=(c:MdCommand)=>{if(live)runMdCommand(live,c);};
 const openLink=()=>{if(!live)return;const r=live.state.selection.main;const sel=live.state.sliceDoc(r.from,r.to);setText(sel);setUrl('');setPending({kind:'link',range:{from:r.from,to:r.to},text:sel});};
 const keep=(e:React.MouseEvent)=>e.preventDefault();
 const primary:Array<{id:string;label:string;Icon:typeof Bold;run:()=>void;key?:string}>=[
  {id:'bold',label:t('md.cmd.bold'),Icon:Bold,run:()=>run('bold'),key:'Mod+B'},{id:'italic',label:t('md.cmd.italic'),Icon:Italic,run:()=>run('italic'),key:'Mod+I'},
  {id:'link',label:t('md.cmd.link'),Icon:LinkIcon,run:openLink},{id:'code',label:t('md.cmd.code'),Icon:Code,run:()=>run('code')},
  {id:'bullet',label:t('md.cmd.bullet'),Icon:List,run:()=>run('bullet')},{id:'task',label:t('md.cmd.task'),Icon:ListChecks,run:()=>run('task')}];
 const more:Array<[MdCommand|'codeblock-dialog',string]>=[['h1',t('md.cmd.h1')],['h2',t('md.cmd.h2')],['h3',t('md.cmd.h3')],['h4',t('md.cmd.h4')],['h5',t('md.cmd.h5')],['h6',t('md.cmd.h6')],['number',t('md.cmd.number')],['quote',t('md.cmd.quote')],['codeblock-dialog',t('md.cmd.codeblock')],['table',t('md.cmd.table')],['strike',t('md.cmd.strike')]];
 const projectMd=Object.keys(files).filter(f=>/\.(md|markdown|html?)$/i.test(f)).sort();
 const close=()=>{setPending(null);live?.focus();};
 const dlgInput='h-9 w-full rounded-[var(--r-control)] border border-default bg-base px-3 text-[13px] text-ink outline-none focus:border-[var(--accent)]';
 return <div className="md-head flex h-9 shrink-0 items-center gap-0.5 border-b border-subtle px-2" role="toolbar" aria-label={t('md.toolbar')} data-testid="md-toolbar">
  <span className="mr-1 px-1 text-[11px] font-medium text-ink-2">{t('md.label.markdown')}</span>
  {primary.map(({id,label,Icon,run:fn,key})=><Button key={id} size="icon" className="md-tool !size-7 min-w-7" data-testid={`md-${id}`} aria-label={label} title={key?`${label} (${formatShortcut(key)})`:label} onMouseDown={keep} onClick={fn}><Icon size={15}/></Button>)}
  <Menu.Root><Menu.Trigger render={<Button size="icon" className="md-tool !size-7 min-w-7" data-testid="md-more" aria-label={t('md.cmd.more')} title={t('md.cmd.more')} onMouseDown={keep}/>}><Ellipsis size={15}/></Menu.Trigger>
   <Menu.Portal><Menu.Positioner sideOffset={4}><Menu.Popup className="menu-popup">{more.map(([id,label])=><Menu.Item key={id} className="menu-item" data-testid={`md-more-${id}`} onClick={()=>{if(id==='codeblock-dialog'){setLang('');setPending({kind:'code'});}else run(id);}}><span>{label}</span></Menu.Item>)}</Menu.Popup></Menu.Positioner></Menu.Portal></Menu.Root>
  <ConfirmShell open={pending?.kind==='link'} onCancel={close} tone="accent" Icon={Link2} ariaLabel={t('md.link.title')} title={t('md.link.title')} description={t('md.cmd.link')}
   body={<form id="md-link-form" className="grid gap-3" onSubmit={e=>{e.preventDefault();if(pending?.kind!=='link'||!url.trim()||!live)return;insertLink(live,text||url,url,pending.range);setPending(null);}}>
    <label className="grid gap-1 text-[12px] text-ink-2">{t('md.link.text')}<input className={dlgInput} data-testid="md-link-text" value={text} onChange={e=>setText(e.target.value)} autoComplete="off"/></label>
    <label className="grid gap-1 text-[12px] text-ink-2">{t('md.link.url')}<input className={dlgInput} data-testid="md-link-url" value={url} onChange={e=>setUrl(e.target.value)} autoFocus autoComplete="off" spellCheck={false}/></label>
    {projectMd.length>0&&<label className="grid gap-1 text-[12px] text-ink-2">{t('md.link.pick')}<select className={dlgInput} data-testid="md-link-pick" value="" onChange={e=>{if(e.target.value)setUrl(e.target.value);}}><option value=""/>{projectMd.map(f=><option key={f} value={f}>{f}</option>)}</select></label>}</form>}
   footer={<><Button className="dlg-cancel" onClick={close}>{t('md.link.cancel')}</Button><span className="dlg-spacer"/><Button variant="primary" type="submit" form="md-link-form" disabled={!url.trim()} data-testid="md-link-insert">{t('md.link.insert')}</Button></>}/>
  <ConfirmShell open={pending?.kind==='code'} onCancel={close} tone="accent" Icon={Code} ariaLabel={t('md.code.title')} title={t('md.code.title')} description={t('md.code.lang')}
   body={<form id="md-code-form" onSubmit={e=>{e.preventDefault();if(live)runMdCommandLang(live,lang);setPending(null);}}><input className={dlgInput} data-testid="md-code-lang" value={lang} onChange={e=>setLang(e.target.value.replace(/[^\w+#.-]/g,''))} autoFocus autoComplete="off" spellCheck={false} aria-label={t('md.code.lang')}/></form>}
   footer={<><Button className="dlg-cancel" onClick={close}>{t('md.link.cancel')}</Button><span className="dlg-spacer"/><Button variant="primary" type="submit" form="md-code-form" data-testid="md-code-insert">{t('md.code.insert')}</Button></>}/>
 </div>;
}
function runMdCommandLang(view:EditorView,lang:string){runMdCommand(view,'codeblock',{lang});}
