import {isTauri,invoke} from '@tauri-apps/api/core';
import {registerCoreCommandSpec} from '../coreCommandRegistration';
import {redactText} from '../log';
import {frameworkRunner} from './runtime';
import {createStaticBuilder,type StaticArtifactSummary} from './staticBuild';
import {getPreviewResourceSource} from '../previewResourceSource';
/** Native collector for server builds: walks the output plus the production dependency closure and returns a kind=node manifest. */
const collect=(runId:string)=>invoke<StaticArtifactSummary>('deploy_node_build_collect',{runId});
/** Same state machine as the static builder: install, one `build` run, collect. Nothing is uploaded. */
export const nodeBuilder=createStaticBuilder(frameworkRunner,collect,{redact:redactText});
registerCoreCommandSpec({id:'frameworks.buildNode',title:'Build server app for publishing',category:'Project',level:'ui',
 params:{type:'object',properties:{install:{type:'boolean'}},additionalProperties:false},enabled:()=>isTauri()&&!!getPreviewResourceSource(),
 run:async(p:{install?:boolean})=>{const source=getPreviewResourceSource();if(!source)throw Error('frameworks.projectMissing');await nodeBuilder.run(source.projectId,p.install!==false);return {phase:nodeBuilder.getSnapshot().phase};}});
