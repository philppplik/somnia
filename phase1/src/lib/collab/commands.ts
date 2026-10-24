import {registerCommandSpec} from '../commandBridge';
import {openShare} from './store';
const NO_PARAMS={type:'object',properties:{},additionalProperties:false} as const;
/**
 * Importing this file registers the menu entries. Category is Tools so no shared menu list changes.
 * Both open a dialog the user completes, so they are `ui` level: agent and MCP origins are refused.
 * Neither touches project history.
 */
registerCommandSpec({id:'collab.share',title:'Share project...',category:'Tools',keywords:['collaborate','invite','host','live'],level:'ui',params:NO_PARAMS,run:()=>openShare('host')});
registerCommandSpec({id:'collab.join',title:'Join shared project...',category:'Tools',keywords:['collaborate','invite','guest','link'],level:'ui',params:NO_PARAMS,run:()=>openShare('join')});
