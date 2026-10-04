/** Save dialog for memory projects. The file adapter registers what each button does; SaveDialog only calls it. */
import {patchState} from '../store/appStore';
interface Handlers{choose:(newFolder:boolean)=>Promise<boolean|void>;exportFolder?:(newFolder:boolean)=>Promise<boolean|void>;download:()=>void}
let handlers:Handlers|null=null;
export const setSaveHandlers=(h:Handlers)=>{handlers=h;};
export const cancelSave=()=>patchState({saveDialog:null});
export const getSaveHandlers=()=>handlers;
export async function runChooseFolder(newFolder=false){if(!handlers)return;patchState({saveDialog:{error:null,busy:true}});
 try{const done=await handlers.choose(newFolder);patchState({saveDialog:done?null:{error:null,busy:false}});}
 catch(e){patchState({saveDialog:{error:e instanceof Error?e.message:String(e),busy:false}});}}
export const runDownload=()=>handlers?.download();
