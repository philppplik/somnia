// Reshaped from shadcn base-nova Button (MIT): Base UI primitive + cva variants, Somnia tokens via the Tailwind theme bridge.
import { Button as Primitive } from '@base-ui/react/button';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/cn';
export const buttonVariants=cva(
 'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-sm border border-transparent text-ink-2 transition-colors duration-100 hover:not-disabled:bg-hover hover:not-disabled:text-ink disabled:cursor-not-allowed disabled:opacity-35 aria-pressed:bg-accent-soft aria-pressed:text-accent cursor-pointer [&_svg]:size-4 [&_svg]:shrink-0',
 {variants:{
  variant:{ghost:'bg-transparent',outline:'bg-elevated border-line',primary:'bg-accent-fill text-white hover:not-disabled:text-white'},
  size:{normal:'h-9 px-3.5',icon:'size-9 p-0',compact:'h-7 px-2 text-[11px]',tiny:'h-6 px-1 text-[10px]',row:'h-7 w-6 p-0 [&_svg]:size-3'}},
  defaultVariants:{variant:'ghost',size:'normal'}});
export function Button({className,variant,size,...props}:Primitive.Props&VariantProps<typeof buttonVariants>){
 return <Primitive data-slot="button" className={cn(buttonVariants({variant,size}),className as string)} {...props}/>;
}
