import {addMediaFiles} from '../projectActions';
import {VIDEO_EXTENSIONS} from './format';
const accept=VIDEO_EXTENSIONS.split('|').map(e=>'.'+e).join(',')+',video/*';
/** System file dialog limited to video; files open as media tabs like audio, images and PDFs. */
export function openVideoDialog(){return new Promise<void>(resolve=>{const input=document.createElement('input');input.type='file';input.multiple=true;input.accept=accept;
 input.onchange=async()=>{if(input.files?.length)await addMediaFiles([...input.files].map(f=>({name:f.name,text:'',blob:f})));resolve();};input.oncancel=()=>resolve();input.click();});}
