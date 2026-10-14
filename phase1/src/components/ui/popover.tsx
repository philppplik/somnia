import {Popover as Primitive} from '@base-ui/react/popover';
export const Popover=Primitive.Root;
export const PopoverTrigger=Primitive.Trigger;
export const PopoverTitle=Primitive.Title;
export const PopoverDescription=Primitive.Description;
export const PopoverClose=Primitive.Close;
export function PopoverContent({className='',positioner,...props}:Primitive.Popup.Props&{positioner?:Primitive.Positioner.Props}){
 return <Primitive.Portal><Primitive.Positioner sideOffset={4} className="z-menu" {...positioner}><Primitive.Popup data-slot="popover" className={`menu-popup ${className}`} {...props}/></Primitive.Positioner></Primitive.Portal>;
}
