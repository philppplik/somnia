import {useEffect,useMemo,useState} from 'react';
import {Button} from '../ui/button';
import {Textarea} from '../ui/native-controls';
import {commandDispatcher} from '../../lib/commandDispatcher';
import {useSlidesSession} from '../../lib/slides/session';
import {useSlidesPanelText} from '../../lib/slides/panelI18n';
import {readSlideNotes,MAX_NOTES_CHARS} from '../../lib/slides/deckPackage';

/** Speaker notes of the viewed slide. Saved explicitly, so one save is one undo step. */
export function SlidesNotesEditor(){
  const s=useSlidesSession(),t=useSlidesPanelText(),slideId=s.slideIds[s.index];
  const saved=useMemo(()=>{if(!s.working||slideId===undefined)return null;try{return readSlideNotes(s.working,slideId).join('\n');}catch{return null;}},[s.working,slideId]);
  const [draft,setDraft]=useState(saved??''),[error,setError]=useState('');
  useEffect(()=>{setDraft(saved??'');setError('');},[saved,slideId,s.source]);
  const dirty=saved!==null&&draft!==saved,ready=!!s.working&&!s.busy&&!s.presenting&&slideId!==undefined&&saved!==null;
  const save=async()=>{
    setError('');
    const r=await commandDispatcher.tryRunCommand('slides.setNotes',{source:s.source,slideId,text:draft},{origin:'ui'});
    if(!r.ok)setError(r.error.message);
  };
  if(saved===null)return null;
  return <div className="flex flex-col gap-2 px-4 py-2">
    <Textarea aria-label={t('slides.notes.label')} className="min-h-24 w-full resize-y rounded border border-subtle bg-transparent p-2 text-sm" value={draft} maxLength={MAX_NOTES_CHARS} disabled={!ready} onChange={e=>setDraft(e.target.value)}/>
    <div className="flex items-center gap-2">
      <Button size="compact" variant="outline" disabled={!ready||!dirty} onClick={()=>void save()}>{t('slides.notes.save')}</Button>
      <Button size="compact" variant="ghost" disabled={!ready||!dirty} onClick={()=>{setDraft(saved);setError('');}}>{t('slides.notes.revert')}</Button>
      <span className="text-xs text-ink-3">{draft.length} / {MAX_NOTES_CHARS}</span>
      {error&&<span role="alert" className="text-xs text-danger">{error}</span>}
    </div>
  </div>;
}
