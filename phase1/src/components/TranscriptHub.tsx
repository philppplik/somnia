import {useEffect,useRef,useState} from 'react';
import {isTauri} from '@tauri-apps/api/core';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from './ui/dialog';
import {Button} from './ui/button';
import {NativeInput,NativeSelect,Textarea} from './ui/native-controls';
import {useT} from '../lib/useT';
import {voiceStatus,type VoiceStatus} from '../lib/agent/nativeVoice';
import {voicePreviewEnabled,type VoiceLanguage} from '../lib/agent/voicePreview';
import {transcribeAudioFile,downloadTranscript,MAX_FILE_BYTES,type FilePhase} from '../lib/transcript/transcribeFile';
import {useTranscriptHub,setTranscriptHubOpen} from '../lib/transcript/session';
import '../styles/transcript-hub.css';
export function TranscriptHub(){const open=useTranscriptHub();return <Dialog open={open} onOpenChange={setTranscriptHubOpen}>{open&&<TranscriptHubBody/>}</Dialog>;}
export function TranscriptHubBody(){
 const {t}=useT(),[file,setFile]=useState<File|null>(null),[language,setLanguage]=useState<VoiceLanguage>('de'),[status,setStatus]=useState<VoiceStatus|null>(null),[checked,setChecked]=useState(false),[phase,setPhase]=useState<FilePhase|null>(null),[text,setText]=useState(''),[message,setMessage]=useState('');
 const job=useRef<AbortController|null>(null),mounted=useRef(true);
 const available=isTauri()&&voicePreviewEnabled();
 useEffect(()=>{mounted.current=true;let valid=true;if(available)void voiceStatus().then(s=>{if(valid)setStatus(s);}).catch(()=>{}).finally(()=>{if(valid)setChecked(true);});else setChecked(true);return()=>{valid=false;mounted.current=false;job.current?.abort();};},[available]);
 const ready=available&&status?.helperReady&&status?.modelReady;
 async function run(){if(!file||!ready||job.current)return;const controller=new AbortController();job.current=controller;setText('');setMessage('');try{const result=await transcribeAudioFile(file,language,controller.signal,p=>{if(mounted.current)setPhase(p);});if(mounted.current&&!controller.signal.aborted){setText(result);setMessage('done');}}catch{if(mounted.current)setMessage(controller.signal.aborted?'cancelled':'failed');}finally{job.current=null;if(mounted.current)setPhase(null);}}
 return <DialogContent className="transcript-hub"><div className="transcript-hub-heading"><div><p className="transcript-hub-eyebrow">{t('transcript.local')}</p><DialogTitle>{t('transcript.title')}</DialogTitle></div><Button onClick={()=>setTranscriptHubOpen(false)}>{t('dialogs.close')}</Button></div><DialogDescription>{t('transcript.description')}</DialogDescription><p className="transcript-hub-note">{t('transcript.limits')}</p>
 <div className="transcript-hub-controls"><label>{t('transcript.file')}<NativeInput type="file" accept="audio/*,.wav,.mp3,.m4a,.ogg,.flac" disabled={!!phase} onChange={e=>{const next=e.target.files?.[0]??null;setText('');setMessage('');if(next&&(!next.size||next.size>MAX_FILE_BYTES)){setFile(null);setMessage('size');e.target.value='';}else setFile(next);}}/></label><label>{t('transcript.language')}<NativeSelect value={language} disabled={!!phase} onChange={e=>setLanguage(e.target.value as VoiceLanguage)}><option value="de">Deutsch</option><option value="en">English</option></NativeSelect></label></div>
 <div className="transcript-hub-status" role="status">{!checked?t('transcript.checking'):!available?t('transcript.unavailable'):!ready?t('transcript.setup'):t('transcript.ready')}</div>
 <div className="transcript-hub-actions"><Button variant="primary" disabled={!ready||!file||!!phase} onClick={()=>void run()}>{t('transcript.start')}</Button>{phase&&<Button onClick={()=>job.current?.abort()}>{t('transcript.cancel')}</Button>}<span role="status">{phase?t('transcript.'+phase):message?t('transcript.'+message):''}</span></div>
 <label className="transcript-hub-result">{t('transcript.result')}<Textarea value={text} maxLength={120000} spellCheck={false} placeholder={t('transcript.empty')} disabled={!!phase} onChange={e=>setText(e.target.value)}/></label><div className="transcript-hub-actions"><Button disabled={!text.trim()||!!phase} onClick={()=>{try{downloadTranscript(text,file?.name??'transcript');}catch{setMessage('failed');}}}>{t('transcript.export')}</Button><Button disabled={!text||!!phase} onClick={()=>{setText('');setMessage('');}}>{t('transcript.clear')}</Button><span>{t('transcript.ephemeral')}</span></div></DialogContent>;
}
