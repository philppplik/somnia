import type {DeployPanelActions} from '../../lib/deployPanels/commands';
import {editPanelStack,shellLayoutStore} from '../../store/shellLayoutStore';
import {studioDefaultLayout,studioPanels} from '../../lib/shell/codePanels';
import {getStudio} from '../../lib/studios';
import {getPublishStore,publishAvailable} from '../../lib/deploy/publishController';
import {summarizePlan} from '../../lib/deploy/confirmStore';
import {checkDomain} from '../../lib/deployPanels/model';
import {patchState} from '../../store/appStore';
import {getState as getAppState} from '../../store/appStore';

/** Opens a Publish panel in the Code studio left stack (same layout operation the rail click uses). */
function showPanel(panel:'publish'|'publish-log'){
 const studio=getStudio('code');if(!studio)return;
 const panels=studioPanels(studio),defaults=studioDefaultLayout(studio),layout=shellLayoutStore.get(studio.id,defaults,panels);
 const collapsed=(layout.collapsedPanels??[]).filter(p=>p!==panel);
 shellLayoutStore.update(studio.id,{...editPanelStack(layout,'left',panel,'focus'),collapsedPanels:collapsed},defaults,panels);
 if(getAppState().activeStudio==='code')patchState({sidebarOpen:true});
}
export const deployPanelActions:DeployPanelActions={
 available:publishAvailable,
 show:showPanel,
 select(targetId){const s=getPublishStore();if(!s.getState().targets.some(t=>t.target.id===targetId)||s.getState().busy)return false;s.select(targetId);return true;},
 async dryRun(targetId){
  const s=getPublishStore();const id=targetId??s.getState().selectedId;if(!id)return null;
  showPanel('publish');const plan=await s.dryRun(id);if(!plan)return null;const n=summarizePlan(plan);
  return {files:plan.files.length,changed:n.changed,added:n.added,removed:n.removed};
 },
 async setDomain(targetId,domain){const c=checkDomain(domain);if(!c.ok)return false;return getPublishStore().updateTarget(targetId,{domain:c.value});},
};
