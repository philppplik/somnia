import '../studios/studio-pill.css';
import {Tooltip as Primitive} from '@base-ui/react/tooltip';
export const TooltipProvider=Primitive.Provider;
export const Tooltip=Primitive.Root;
export const TooltipTrigger=Primitive.Trigger;
export function TooltipContent({className='',positioner,...props}:Primitive.Popup.Props&{positioner?:Primitive.Positioner.Props}){
 return <Primitive.Portal><Primitive.Positioner side="bottom" sideOffset={8} className="z-menu" {...positioner}><Primitive.Popup data-slot="tooltip" className={`studio-pill-tooltip ${className}`} {...props}/></Primitive.Positioner></Primitive.Portal>;
}
/** Compatibility namespace for coupled studio JSX. Existing names/hooks and portal
 * geometry are retained; new callers can use the flat TooltipContent API. */
function TooltipPopup({className='',...props}:Primitive.Popup.Props){return <Primitive.Popup data-slot="tooltip" className={className} {...props}/>;}
export const StudioTooltip={Provider:Primitive.Provider,Root:Primitive.Root,Trigger:Primitive.Trigger,Portal:Primitive.Portal,Positioner:Primitive.Positioner,Popup:TooltipPopup};
