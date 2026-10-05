import {registerCommand} from '../commands';
import {openShare} from './store';
/** Importing this file registers the menu entries. Category is Tools so no shared menu list changes. */
registerCommand({id:'collab.share',title:'Share project...',category:'Tools',keywords:['collaborate','invite','host','live'],run:()=>openShare('host')});
registerCommand({id:'collab.join',title:'Join shared project...',category:'Tools',keywords:['collaborate','invite','guest','link'],run:()=>openShare('join')});
