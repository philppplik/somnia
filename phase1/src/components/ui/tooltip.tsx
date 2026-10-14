import '../studios/studio-pill.css';
import {Tooltip as Primitive} from '@base-ui/react/tooltip';
export const TooltipProvider=Primitive.Provider;
export const Tooltip=Primitive.Root;
export const TooltipTrigger=Primitive.Trigger;
export function TooltipContent({className='',positioner,...props}:Primitive.Popup.Props&{positioner?:Primitive.Positioner.Props}){
 return <Primitive.Portal><Primitive.Positioner side="bottom" sideOffset={8} className="z-menu" {...positioner}><Primitive.Popup data-slot="tooltip" className={`studio-pill-tooltip ${className}`} {...props}/></Primitive.Positioner></Primitive.Portal>;
}
