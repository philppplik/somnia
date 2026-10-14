/** Build-time opt-in only. No persistence, runtime download or microphone side effects. */
export function voicePreviewEnabled(value:unknown=import.meta.env?.VITE_LOCAL_VOICE_PREVIEW):boolean{return value==='true';}
export type VoiceLanguage='de'|'en';
export function voiceLanguage(value:unknown):VoiceLanguage{if(value!=='de'&&value!=='en')throw Error('Unsupported voice language');return value;}
export function appendVoiceDraft(original:string,transcript:string,maxLength:number):string{if(!Number.isSafeInteger(maxLength)||maxLength<1||!transcript.trim()||transcript.includes('\0'))throw Error('Invalid voice draft');const next=original+(original?'\n':'')+transcript.trim();if(next.length>maxLength)throw Error('Prompt exceeds limit');return next;}
