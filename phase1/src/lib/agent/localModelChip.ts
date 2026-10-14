import {effectiveLocalChoice} from './localAssistant';import type {LocalTask} from './taskRouting';import type {TaskModels} from './taskRouting';
export type LocalChipState='loading'|'busy'|'not-local'|'missing'|'unverified';
/** Existing settings state only. Configuration readiness is never daemon/model readiness. */
export function localChipState(config:{provider:string;model:string;localRuntime?:{taskModels?:TaskModels;studioModels?:Record<string,string>}},studioId:string,task:LocalTask,ready:boolean,busy:boolean){const choice=effectiveLocalChoice(config,task,studioId);return {...choice,state:!ready?'loading':busy?'busy':choice.provider!=='ollama'?'not-local':!choice.model.trim()?'missing':'unverified'} as typeof choice&{state:LocalChipState};}
