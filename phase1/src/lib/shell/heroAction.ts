import {evalWhen} from './when';
import type {HeroActionDef} from './types';
/** The header hero slot. Pure resolution, no UI: the component only renders what this returns. */
export const PUBLISH_COMMAND_ID='deploy.open';
export interface HeroCommandInfo{id:string;title:string;shortcut?:string;enabled:boolean}
export interface HeroMenuEntry extends HeroCommandInfo{/** True for the always-last Publish entry. */publish:boolean}
export type HeroResolution=
 |{kind:'default'}
 |{kind:'hero';id:string;labelKey:string;icon:string;enabled:boolean;shortcut?:string;menu:readonly HeroMenuEntry[]};
/**
 * No field, a failing `when`, a hero command that is not registered, or a hero that is Publish itself all give the old Publish button.
 * Menu entries that are not registered are dropped, duplicates and the hero id are removed, and Publish is always last.
 * `lookup` returns the live command (title, shortcut, enabled) or undefined when it is not registered.
 */
export function resolveHeroAction(def:HeroActionDef|undefined,context:unknown,lookup:(id:string)=>HeroCommandInfo|undefined):HeroResolution{
 if(!def)return {kind:'default'};
 const variant=def.variants?.find(v=>evalWhen(v.when,context));
 if(variant)def={...def,...variant,when:def.when};
 if(def.id===PUBLISH_COMMAND_ID)return {kind:'default'};
 if(def.when!==undefined&&!evalWhen(def.when,context))return {kind:'default'};
 const hero=lookup(def.id);if(!hero)return {kind:'default'};
 const seen=new Set<string>([def.id,PUBLISH_COMMAND_ID]);const menu:HeroMenuEntry[]=[];
 for(const id of def.menu??[]){if(seen.has(id))continue;seen.add(id);const c=lookup(id);if(c)menu.push({...c,publish:false});}
 const publish=lookup(PUBLISH_COMMAND_ID);
 menu.push({id:PUBLISH_COMMAND_ID,title:publish?.title??'Publish...',shortcut:publish?.shortcut,enabled:publish?.enabled??false,publish:true});
 return {kind:'hero',id:def.id,labelKey:def.labelKey,icon:def.icon,enabled:hero.enabled,shortcut:hero.shortcut,menu};
}
