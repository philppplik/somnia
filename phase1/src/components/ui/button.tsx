// Reshaped from shadcn base-nova Button (MIT). No stock theme classes.
import { Button as Primitive } from '@base-ui/react/button';
export function Button({className='',variant='ghost',size='normal',...props}:Primitive.Props&{variant?:'ghost'|'outline'|'primary';size?:'normal'|'icon'}){
 return <Primitive data-slot="button" className={`button button-${variant} button-${size} ${className}`} {...props}/>;
}
