/** Save dialog for memory projects. The file adapter registers what each button does; SaveDialog only calls it. */
import {patchState} from '../store/appStore';
interface Handlers{choose:()=>Promise<boolean|void>;download:()=>void}
let handlers:Handlers|null=null;
export const setSaveHandlers=(h:Handlers)=>{handlers=h;};
export const cancelSave=()=>patchState({saveDialog:null});
export async function runChooseFolder(){if(!handlers)return;patchState({saveDialog:{error:null,busy:true}});
 try{const done=await handlers.choose();patchState({saveDialog:done?null:{error:null,busy:false}});}
 catch(e){patchState({saveDialog:{error:e instanceof Error?e.message:String(e),busy:false}});}}
export const runDownload=()=>handlers?.download();
