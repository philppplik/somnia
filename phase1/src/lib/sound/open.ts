import {addMediaFiles} from '../projectActions';
import {AUDIO_EXTENSIONS} from './format';
const accept=AUDIO_EXTENSIONS.split('|').map(e=>'.'+e).join(',')+',audio/*';
/** System file dialog limited to audio; files open as media tabs like images and PDFs. */
export function openAudioDialog(){return new Promise<void>(resolve=>{const input=document.createElement('input');input.type='file';input.multiple=true;input.accept=accept;
 input.onchange=async()=>{if(input.files?.length)await addMediaFiles([...input.files].map(f=>({name:f.name,text:'',blob:f})));resolve();};input.oncancel=()=>resolve();input.click();});}
