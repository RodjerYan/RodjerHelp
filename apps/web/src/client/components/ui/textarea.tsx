import * as React from 'react';

import { cn } from '@/lib/utils';

function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'placeholder:text-muted-foreground flex field-sizing-content min-h-16 w-full rounded-[20px] border border-border/80 bg-white/70 px-4 py-3 text-base shadow-[inset_0_1px_0_rgba(255,255,255,0.74)] backdrop-blur-md transition-[color,box-shadow,background-color,border-color] outline-none focus-visible:border-ring focus-visible:bg-white/92 focus-visible:ring-ring/30 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
