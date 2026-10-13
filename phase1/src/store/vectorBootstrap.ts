import {registerBlankProjectFactory} from '../lib/studios/blank';
import {createBlankVector} from '../lib/vectorstudio/session';
import {requestStudio,getState} from './appStore';
registerBlankProjectFactory('vector',()=>{if(createBlankVector(1024,1024))requestStudio('vector','manual');});
export const vectorCommandsReady=import('../lib/vectorstudio/commands').then(module=>module.registerVectorCommands(()=>getState().activeStudio==='vector'));
