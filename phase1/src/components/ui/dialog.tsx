// Compound parts adapted from shadcn base-nova Dialog (MIT), Somnia palette layout.
import { Dialog as Primitive } from '@base-ui/react/dialog';
export const Dialog=Primitive.Root;
export const DialogTitle=Primitive.Title;
export const DialogDescription=Primitive.Description;
export function DialogContent({className='',...props}:Primitive.Popup.Props){return <Primitive.Portal><Primitive.Backdrop className="dialog-backdrop"/><Primitive.Popup className={`dialog-popup ${className}`} {...props}/></Primitive.Portal>;}
