import {getState} from '../../store/appStore';
import {openSvgSource} from './session';
/** System file dialog for SVG; the file is parsed strictly and opened in the Vector Studio. */
export function openSvgDialog():Promise<void>{return new Promise(resolve=>{const input=document.createElement('input');input.type='file';input.accept='.svg,image/svg+xml';
 input.onchange=async()=>{const f=input.files?.[0];if(f)openSvgSource(await f.text(),f.name);resolve();};input.oncancel=()=>resolve();input.click();});}
/** Opens the active project SVG file (text tab) in the Vector Studio. Returns false when the active file is not an SVG. */
export function openActiveProjectSvg():boolean{const st=getState();const f=st.activeFile;if(!/\.svg$/i.test(f)||!(f in st.files))return false;return openSvgSource(st.files[f],f.replace(/^.*[\\/]/,''));}
