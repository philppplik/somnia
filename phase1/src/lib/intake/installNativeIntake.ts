/**
 * Native intake starter (integrator glue): builds the D2-E orchestrator deps
 * from the real Tauri client, the S9 coordinator, the D3 gate/presenter/retry
 * modules and D1 logging, then registers it with the file adapter.
 * Web builds never install a starter; the adapter then skips intake entirely.
 */
import {isTauri} from '@tauri-apps/api/core';
import {installIntakeStarter} from '../fileAdapter';
import {createTauriOpenRequestClient} from './openRequestClient';
import {startIntakeOrchestrator} from './intakeOrchestrator';
import {openIncoming,type IntakeFile} from '../studios/openIntake';
import type {OpenInput,BatchOptions} from '../studios/openCoordinator';
import {whenIntakeAllowed} from '../diagnostics/intakeGate';
import {presentIntakeOutcome,registerIntakeContext} from '../diagnostics/noticePresenter';
import {registerIntakeRetryExecutor} from '../diagnostics/retryActions';
import type {IntakeOperationNotice as StoreNotice} from '../diagnostics/uiTypes';
import type {IntakeOperationNotice as RunNotice} from './intakeTypes';
import {logEvent} from '../log';
import type {ErrorId} from '../../generated/errorIds';

/** Coordinator inputs carry bytes; the S9 intake seam consumes files. */
const toIntakeFile=(input:OpenInput):IntakeFile=>({
 name:input.name,
 text:'',
 blob:new Blob([input.bytes as BlobPart]),
 ...(input.requestId!==undefined?{requestId:input.requestId}:{}),
 ...(input.ordinal!==undefined?{ordinal:input.ordinal}:{}),
 ...(input.identityToken!==undefined?{identityToken:input.identityToken}:{}),
});
const openFiles=(inputs:OpenInput[],opts?:BatchOptions)=>openIncoming(inputs.map(toIntakeFile),opts);

/** Store notices have four counters; activated-existing counts as opened, cancel lands in deferred with a reason. */
const toStoreNotice=(notice:RunNotice):StoreNotice=>({
 kind:'operation',
 corr:notice.corr as StoreNotice['corr'],
 opened:notice.counts.opened+notice.counts.activatedExisting,
 rejected:notice.counts.rejected,
 failed:notice.counts.failed,
 deferred:notice.counts.deferred+notice.counts.cancelled,
 items:notice.items.map(item=>({
  ordinal:item.ordinal,
  status:item.status==='opened'||item.status==='activated-existing'?'opened' as const
   :item.status==='rejected'?'rejected' as const
   :item.status==='failed'?'failed' as const
   :'deferred' as const,
  ...(item.status==='cancelled'?{reasonKey:'cancelled'}:{}),
  ...(item.incidentId!==undefined?{incidentId:item.incidentId as StoreNotice['items'][number]['incidentId']}:{}),
 })),
 ...(notice.resetCount>0?{resetCount:notice.resetCount,affectedItems:notice.items.length}:{}),
});

export function installNativeIntake():void{
 if(!isTauri())return;
 installIntakeStarter(async(_port,focusProject)=>{
  const client=createTauriOpenRequestClient();
  if(!client)return()=>{};
  return startIntakeOrchestrator({
   client,
   whenIntakeAllowed,
   openFiles,
   presentIntakeOutcome:notice=>presentIntakeOutcome(toStoreNotice(notice)),
   focusExisting:focusProject,
   registerIntakeContext,
   registerRetryExecutor:run=>registerIntakeRetryExecutor(async(requestId,ordinal,token)=>({status:await run(requestId,ordinal,token)})),
   logEvent:(id,context)=>logEvent(id as ErrorId,{corr:context.corr,cause:context.cause,context:{...(context.ordinal!==undefined?{ordinal:context.ordinal}:{}),...(context.ext!==undefined?{ext:context.ext}:{}),...(context.cause!==undefined?{cause:context.cause}:{})}}),
  });
 });
}
