import {Menu as Primitive} from '@base-ui/react/menu';
export const Menu=Primitive.Root;
export const MenuTrigger=Primitive.Trigger;
export const MenuGroup=Primitive.Group;
export const MenuGroupLabel=Primitive.GroupLabel;
export const MenuSubmenu=Primitive.SubmenuRoot;
export const MenuSubmenuTrigger=Primitive.SubmenuTrigger;
export const MenuSeparator=Primitive.Separator;
export function MenuContent({className='',positioner,...props}:Primitive.Popup.Props&{positioner?:Primitive.Positioner.Props}){
 return <Primitive.Portal><Primitive.Positioner sideOffset={4} {...positioner}><Primitive.Popup data-slot="menu" className={`menu-popup ${className}`} {...props}/></Primitive.Positioner></Primitive.Portal>;
}
export function MenuItem({className='',...props}:Primitive.Item.Props){return <Primitive.Item data-slot="menu-item" className={`menu-item ${className}`} {...props}/>;}
export const MenuCheckboxItem=Primitive.CheckboxItem;
export const MenuCheckboxIndicator=Primitive.CheckboxItemIndicator;
export const MenuRadioGroup=Primitive.RadioGroup;
export const MenuRadioItem=Primitive.RadioItem;
export const MenuRadioIndicator=Primitive.RadioItemIndicator;
/** Legacy compound surface: preserves existing portals/positioners/classes during chrome adoption. */
export const ChromeMenu=Primitive;
