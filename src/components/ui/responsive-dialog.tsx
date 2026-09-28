import type { ReactNode } from 'react';

import { cn } from 'cn';

import { useIsMobile } from '@/hooks/use-mobile';

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './dialog';
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from './drawer';

export function ResponsiveDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const mobile = useIsMobile();
  if (mobile)
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent
          className={cn('[&>div:first-child]:mt-2 [&>div:first-child]:w-10', className)}>
          <DrawerHeader className="shrink-0 gap-1 px-4 py-2 group-data-[vaul-drawer-direction=bottom]/drawer-content:text-left group-data-[vaul-drawer-direction=top]/drawer-content:text-left">
            <DrawerTitle className="text-sm leading-5">{title}</DrawerTitle>
            <DrawerDescription className="text-xs leading-4 empty:hidden">
              {description}
            </DrawerDescription>
          </DrawerHeader>
          <div className="min-h-0 space-y-4 overflow-y-auto overscroll-contain px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {children}
          </div>
        </DrawerContent>
      </Drawer>
    );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn('max-h-[85dvh] overflow-y-auto', className ?? 'sm:max-w-xl')}
        onOpenAutoFocus={(event) => {
          if (className?.includes('egress-sheet-dialog')) event.preventDefault();
        }}>
        <DialogHeader className="gap-1">
          <DialogTitle className="pr-8 text-sm leading-5">{title}</DialogTitle>
          <DialogDescription className="text-xs leading-4 empty:hidden">
            {description}
          </DialogDescription>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}
