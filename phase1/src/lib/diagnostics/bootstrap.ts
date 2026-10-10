/**
 * App bootstrap wiring for the D3 diagnostics package (integrator glue).
 * Created synchronously from main.tsx BEFORE the intake orchestrator can
 * start: review.start() acquires the initial-review intake pause in the same
 * turn, never from a React effect.
 */
import {isTauri} from '@tauri-apps/api/core';
import {createNativeDiagnosticsClient,createWebDiagnosticsClient,type DiagnosticsClient} from './client';
import {createDiagnosticsStore,type DiagnosticsStore} from './diagnosticsStore';
import {createCrashReviewStore,type CrashReviewStore} from './crashReviewStore';
import {createDiagnosticsHostStore,installDiagnosticsHost,type DiagnosticsHostStore} from './hostStore';
import {connectFailureNotices} from './noticePresenter';
import {recentSafeEvents,subscribeReportedFailures} from '../log';
import {buildErrorReport} from '../errorReport';
import {coordinator} from '../studios/openIntake';
import type {DiagnosticsSelection,DiagnosticSnapshot,SafeLogEvent} from './uiTypes';

export interface DiagnosticsRuntime{host:DiagnosticsHostStore;diagnostics:DiagnosticsStore;review:CrashReviewStore}

/** Web preview: same safe entries, rendered by D1's report builder; no native ZIP, no crash listing. */
async function webPrepare(selection:DiagnosticsSelection,rendererEntries:readonly SafeLogEvent[]):Promise<DiagnosticSnapshot>{
 const now=Date.now();
 return {
  snapshotId:'web-preview',
  createdAt:new Date(now).toISOString(),
  selection,
  files:[],
  reportText:await buildErrorReport(),
  totalUncompressedBytes:0,
  expiresAt:new Date(now+5*60_000).toISOString(),
  health:'partial',
  omissions:rendererEntries.length?[]:['no-reportable-entries'],
 };
}

let runtime:DiagnosticsRuntime|null=null;
export function initDiagnostics():DiagnosticsRuntime{
 if(runtime)return runtime;
 const client:DiagnosticsClient=isTauri()?createNativeDiagnosticsClient():createWebDiagnosticsClient(webPrepare);
 const writeClipboard=(text:string)=>navigator.clipboard.writeText(text);
 const diagnostics=createDiagnosticsStore(client,()=>recentSafeEvents(),writeClipboard);
 const review=createCrashReviewStore(client);
 const host=createDiagnosticsHostStore(coordinator.whenDestructiveApprovalIdle);
 // Synchronously before any intake claim; web mode skips listing internally.
 void review.start();
 installDiagnosticsHost(host);
 connectFailureNotices(subscribeReportedFailures);
 runtime={host,diagnostics,review};
 return runtime;
}
/** Root fatal path: drop any open surface but keep the preview route working. */
export function disposeDiagnosticsSurface():void{
 runtime?.review.dispose();
 runtime?.host.close();
}
