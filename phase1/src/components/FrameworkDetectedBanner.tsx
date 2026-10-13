import {useAppStore,patchState} from '../store/appStore';
import {detectFramework} from '../lib/frameworks/detect';
import {useT} from '../lib/useT';
import {Button} from './ui/button';
/** Detection never starts a process. Only this explicit click enters runner setup. */
export function FrameworkDetectedBanner(){const {t}=useT();const state=useAppStore();const result=detectFramework(state.files);if(!result||state.livePreview||state.activeStudio!=='code')return null;return <div className="flex items-center gap-2 border-b border-subtle px-3 py-1.5 text-[11px]" data-testid="framework-detected"><span className="rounded-full bg-accent-soft px-2 py-1 text-ink-2">{t('frameworks.detected',{framework:result.framework})}</span><span className="grow"/><Button onClick={()=>patchState({livePreview:true,viewMode:'split'})}>{t('frameworks.runPreview')}</Button></div>;}
