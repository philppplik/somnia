import {addMediaFiles} from '../projectActions';
import {PHOTO_INPUT} from './studioSettings';
/** System file dialog limited to JPEG/PNG; files open as media tabs like audio and video. */
export function openPhotoDialog(){return new Promise<void>(resolve=>{const input=document.createElement('input');input.type='file';input.multiple=true;input.accept=PHOTO_INPUT.accept;
 input.onchange=async()=>{if(input.files?.length)await addMediaFiles([...input.files].map(f=>({name:f.name,text:'',blob:f})));resolve();};input.oncancel=()=>resolve();input.click();});}
