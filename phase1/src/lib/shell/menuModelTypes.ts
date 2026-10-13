import type {MenuId} from './types';

export interface MenuModelItem{id:string;title:string;shortcut?:string;enabled:boolean}
/** A submenu node. `enabled` is false when every item inside (at any depth) is disabled. Max two levels deep (see menuGrouping). */
export interface MenuModelSubmenu{id:string;submenu:true;title:string;entries:MenuModelEntry[];enabled:boolean}
export type MenuModelEntry=MenuModelItem|MenuModelSubmenu|{separator:true};
export interface MenuModel{
 menu:MenuId;
 /** The in-app View menu renders the studio mode radios (StudioViewMenu) above the items. */
 viewModes:boolean;
 entries:MenuModelEntry[];
 /** Zero visible items: the trigger renders disabled, never hidden (D6). */
 disabled:boolean;
}
