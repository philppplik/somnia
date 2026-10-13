import {useSyncExternalStore} from 'react';
import {frameworkSession} from '../lib/frameworks/runtime';
import {useT} from '../lib/useT';
/** Bounded, redacted runner output belongs in Problems, never in the main canvas. */
export function FrameworkRunnerOutput(){const {t}=useT();const state=useSyncExternalStore(frameworkSession.subscribe,frameworkSession.getSnapshot,frameworkSession.getSnapshot);if(!state.logs.length)return null;
 return <details className="mt-2 border-t border-subtle pt-2" data-testid="framework-runner-output"><summary className="cursor-pointer text-[11px] text-ink-2">{t('frameworks.output')}</summary><pre data-copyable className="max-h-40 overflow-auto whitespace-pre-wrap break-words text-[10px] text-ink-2">{state.logs.map(log=>log.line).join('\n')}</pre></details>;}
