import type {PrimitiveDensity} from './density';
// shadcn-style native input, using the same Somnia tokens as the Base UI primitives.
import type { ComponentProps } from "react";
import { cn } from "../../lib/cn";
export function Input({ className, density, ...props }: ComponentProps<"input"> & {density?:PrimitiveDensity}) {
  return (
    <input
      data-slot="input"
      data-density={density}
      className={cn(
        "h-9 w-full rounded-sm border border-subtle bg-surface px-3 text-sm disabled:opacity-50 aria-invalid:border-warning",
        className,
      )}
      {...props}
    />
  );
}
