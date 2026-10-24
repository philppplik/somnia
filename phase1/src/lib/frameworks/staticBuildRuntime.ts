import {isTauri,invoke} from '@tauri-apps/api/core';
import {registerCoreCommandSpec} from '../coreCommandRegistration';
import {redactText} from '../log';
import {frameworkRunner} from './runtime';
import {createStaticBuilder,type StaticArtifactSummary} from './staticBuild';
import {getPreviewResourceSource} from '../previewResourceSource';
/** Native collector: walks the finished build's output, hashes it, returns relative paths only. */
const collect=(runId:string)=>invoke<StaticArtifactSummary>('deploy_artifact_collect',{runId});
export const staticBuilder=createStaticBuilder(frameworkRunner,collect,{redact:redactText});
/** Same level as frameworks.run: a click is the confirmation, agent and MCP origins are refused by the dispatcher. */
registerCoreCommandSpec({id:'frameworks.buildStatic',title:'Build project for publishing',category:'Project',level:'ui',
 params:{type:'object',properties:{install:{type:'boolean'}},additionalProperties:false},enabled:()=>isTauri()&&!!getPreviewResourceSource(),
 run:async(p:{install?:boolean})=>{const source=getPreviewResourceSource();if(!source)throw Error('frameworks.projectMissing');await staticBuilder.run(source.projectId,p.install!==false);return {phase:staticBuilder.getSnapshot().phase};}});
