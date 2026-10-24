import {useSyncExternalStore} from 'react';
import {nativeRunLedger,type NativeRunSnapshot} from '../../lib/agent/nativeRun';
import {useT} from '../../lib/useT';
export function NativeRunStatus({snapshot}: {snapshot?:NativeRunSnapshot}){
 const live=useSyncExternalStore(nativeRunLedger.subscribe,nativeRunLedger.snapshot,nativeRunLedger.snapshot),value=snapshot??live;const {t}=useT();
 return <details className="space-y-2 rounded border p-3" open><summary>{t('agent.native.receipts')}</summary><p>{t('agent.native.boundary')}</p>{value.runId&&<><p>{value.provider} / {value.model} · {value.runId}</p><ol className="space-y-2">{value.entries.map((e,i)=><li key={i} className="break-words"><strong>{t('agent.native.phase.'+e.phase)}</strong>{e.target&&<p>{e.target.path} · {e.target.documentId} · r{e.target.revision}</p>}{e.tool&&<p>{e.tool}</p>}{e.contextBytes!==undefined&&<p>{e.contextBytes} {t('agent.native.bytes')}</p>}<p>{t('agent.native.history')}: {e.history==='unverified'?t('agent.native.unknown'):e.history} · {t('agent.native.readback')}: {t('agent.native.'+e.readback)}</p></li>)}</ol></>}</details>;
}
