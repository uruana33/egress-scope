import type { ComponentProps } from 'react';

import { Slot } from 'radix-ui';

import { cn } from '@/lib/utils';

export function UnderlineHover({
  asChild = false,
  className,
  ...props
}: ComponentProps<'span'> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : 'span';
  return <Comp className={cn('underline-hover', className)} {...props} />;
}
