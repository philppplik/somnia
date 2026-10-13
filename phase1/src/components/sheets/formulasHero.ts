import {getStudio} from '../../lib/studios';
import {studioDefaultLayout,studioPanels} from '../../lib/shell/codePanels';
import {shellLayoutStore,editPanelStack} from '../../store/shellLayoutStore';
import {patchState} from '../../store/appStore';
import {panelStateStore} from '../../store/panelStateStore';
import {getSheetsSelection} from '../../lib/sheets/sheetsStore';
import {parsePanelRange,rangeAddress} from '../../lib/sheets/panelModel';
import {requestFormulasFocus} from '../../lib/sheets/formulasFocus';
/**
 * The Smart Formula hero's component-layer half (docs/concepts/hero-action-sheets.md):
 * reveal the formula builder panel (never toggle it closed), seed its source from the live
 * selection instead of the persisted default, and focus its first field. Repeated clicks
 * only re-focus. This touches panel layout (src/store), so it lives outside src/lib.
 */
export function openSheetsFormulasPanel(){
 const studio=getStudio('sheets');
 const panels=studioPanels(studio),defaults=studioDefaultLayout(studio);
 const layout=shellLayoutStore.get(studio.id,defaults,panels);
 shellLayoutStore.update(studio.id,{
  ...editPanelStack(layout,'right','formulas','open'),
  collapsedPanels:(layout.collapsedPanels??[]).filter(p=>p!=='formulas'),
 },defaults,panels);
 patchState({inspectorOpen:true});
 const s=getSheetsSelection();
 if(s){
  const seed=s.range?rangeAddress(s.range):s.address;
  if(parsePanelRange(seed))panelStateStore.set('sheets.formulas.source',seed);
 }
 requestFormulasFocus();
}
