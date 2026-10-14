import {Button} from '../ui/button';
import {useT} from '../../lib/useT';
import {setActiveMedia} from '../../lib/media';
import {handoffOrigin,setPendingReturn} from '../../lib/handoff/registry';
/** CA1: one quiet line when this workbook came from a Slides table; the trip back leaves a pending payload the deck applies explicitly. */
export function SheetsHandoffBar({file,disabled,getRows,onError}:{file:string;disabled:boolean;getRows():Promise<string[][]>;onError(message:string):void}){
 const {t}=useT();
 const origin=handoffOrigin(file);
 if(!origin)return null;
 const back=async()=>{
  try{setPendingReturn(file,origin,await getRows());setActiveMedia(origin.file);}
  catch(e){onError(t('handoff.returnFailed',{message:e instanceof Error?e.message:String(e)}));}
 };
 return <div className="flex items-center gap-2 border-b border-subtle px-3 py-1 text-xs" data-testid="sheets-handoff-bar">
  <span className="truncate text-ink-3">{t('handoff.fromSlides',{label:origin.label})}</span>
  <Button size="compact" variant="outline" disabled={disabled} onClick={()=>void back()} data-testid="sheets-return-slides">{t('handoff.returnToSlides')}</Button>
 </div>;
}
