import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { motion } from 'framer-motion';
import { X } from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/utils';

// Context to share animation state with content
const DialogAnimationContext = React.createContext<{ isOpen: boolean }>({ isOpen: false });

// Animation duration for exit (keep in sync with motion transitions below)
const EXIT_ANIMATION_DURATION = 100;

// Dialog with exit animation support
function Dialog({
  open,
  onOpenChange,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Root>) {
  // Track if we should show the dialog (delays close for exit animation)
  const [shouldShow, setShouldShow] = React.useState(!!open);

  React.useEffect(() => {
    if (open) {
      setShouldShow(true);
    } else if (shouldShow) {
      // Only delay if we were previously showing
      const timer = setTimeout(() => setShouldShow(false), EXIT_ANIMATION_DURATION);
      return () => clearTimeout(timer);
    }
  }, [open, shouldShow]);

  return (
    <DialogAnimationContext.Provider value={{ isOpen: !!open }}>
      <DialogPrimitive.Root
        data-slot="dialog"
        open={shouldShow}
        onOpenChange={onOpenChange}
        {...props}
      />
    </DialogAnimationContext.Provider>
  );
}

function DialogTrigger({ ...props }: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}

function DialogPortal({ ...props }: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />;
}

function DialogClose({ ...props }: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}

// DialogOverlay is handled inline in DialogContent for animation coordination

const DialogContent = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => {
  const { t } = useTranslation('common');
  const { isOpen } = React.useContext(DialogAnimationContext);

  return (
    <DialogPortal>
      <DialogPrimitive.Overlay asChild>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: isOpen ? 1 : 0 }}
          transition={{ duration: EXIT_ANIMATION_DURATION / 1000 }}
          className="fixed inset-0 z-50 bg-[rgba(234,242,255,0.58)] backdrop-blur-[18px]"
        />
      </DialogPrimitive.Overlay>
      <DialogPrimitive.Content
        ref={ref}
        data-slot="dialog-content"
        aria-describedby={undefined}
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        {...props}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: -10 }}
          animate={{
            opacity: isOpen ? 1 : 0,
            scale: isOpen ? 1 : 0.95,
            y: isOpen ? 0 : -10,
          }}
          transition={{ duration: EXIT_ANIMATION_DURATION / 1000, ease: 'easeOut' }}
          className={cn(
            'macos26-dialog relative grid w-full max-w-lg gap-4 border border-border/80 bg-[rgba(255,255,255,0.82)] p-6 shadow-[0_30px_80px_rgba(45,74,128,0.2)] sm:rounded-[24px]',
            className,
          )}
        >
          {children}
          <DialogPrimitive.Close className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full border border-border/70 bg-white/85 text-muted-foreground opacity-95 transition-colors hover:bg-white hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring/60 focus:ring-offset-2 disabled:pointer-events-none">
            <X className="h-4 w-4" />
            <span className="sr-only">{t('buttons.close')}</span>
          </DialogPrimitive.Close>
        </motion.div>
      </DialogPrimitive.Content>
    </DialogPortal>
  );
});
DialogContent.displayName = 'DialogContent';

function DialogHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="dialog-header"
      className={cn('flex flex-col space-y-1.5 text-center sm:text-left', className)}
      {...props}
    />
  );
}

function DialogFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn('flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2', className)}
      {...props}
    />
  );
}

function DialogTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn('text-lg font-semibold leading-none tracking-tight', className)}
      {...props}
    />
  );
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn('text-sm text-muted-foreground', className)}
      {...props}
    />
  );
}

export {
  Dialog,
  DialogPortal,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};
