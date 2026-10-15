import {registerStudio,type StudioDef} from './registry';
import {sheetsShellV2} from './sheetsRail';
/** Sheets Studio: XLSX workbooks in an isolated spreadsheet engine (WASM worker). Document buffers stay outside the shell. */
export const sheetsStudio:StudioDef={
 id:'sheets',label:'studio.sheets',icon:'Table2',order:2,
 formats:[{ext:'xlsx',mime:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',priority:10}],
 shell:{
  leftRail:[{id:'files',label:'Files',icon:'Files',global:true},{id:'search',label:'Search',icon:'Search',global:true},{id:'versions',label:'Versions',icon:'VersionsIcon',global:true}],
  rightRail:[],
  header:{menus:['Project','Edit','View','Tools','Help'],views:[],
   /** Smart Formula hero (docs/concepts/hero-action-sheets.md): opens and focuses the formula builder, seeded from the selection. */
   heroAction:{id:'sheets.formulas.open',labelKey:'hero.smartFormula',icon:'CodeXml',menu:['sheets.saveCopy']}},
  bottomBar:{slots:['cursor'],viewportPresets:[]},inspector:'sheets.inspector',tools:[]
 },commands:[],
 shortcuts:{},menus:{view:[]},canvas:'sheets.canvas',shellV2:sheetsShellV2,
 agentV2:{tools:['sheets_inspect_cell','sheets_propose_cell'],contextProviders:['activeDocument'],quickActions:[]},
 agent:{tools:['sheets_inspect_cell','sheets_propose_cell'],contextProviders:['activeDocument'],quickActions:[]},deriveContext:context=>context
};
registerStudio(sheetsStudio);
