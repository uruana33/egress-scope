import * as React from 'react';

import { gsap } from 'gsap';
import { Tabs as TabsPrimitive } from 'radix-ui';

import { cn } from '@/lib/utils';

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './tooltip';

export type AnimatedSegmentedTabsOption<TValue extends string = string> = {
  label: React.ReactNode;
  tooltip?: React.ReactNode;
  value: TValue;
  disabled?: boolean;
};

type AnimatedSegmentedTabsProps<TValue extends string = string> = Omit<
  React.ComponentProps<typeof TabsPrimitive.Root>,
  'onValueChange' | 'value'
> & {
  label: string;
  options: readonly AnimatedSegmentedTabsOption<TValue>[];
  value: TValue;
  onValueChange: (value: TValue) => void;
  listClassName?: string;
  triggerClassName?: string;
  highlightClassName?: string;
  renderList?: (list: React.ReactNode) => React.ReactNode;
};

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';
const motionReduced = () =>
  typeof window !== 'undefined' && window.matchMedia(REDUCED_MOTION_QUERY).matches;

const LIST_STYLE = cn(
  'relative inline-flex h-8 w-fit items-center justify-center',
  'rounded-lg bg-muted p-[3px] text-muted-foreground'
);

const HIGHLIGHT_STYLE = cn(
  'pointer-events-none absolute left-0 top-0 z-0',
  'rounded-md bg-background opacity-0 shadow-sm ring-1 ring-foreground/5',
  'will-change-transform'
);

const TRIGGER_STYLE = cn(
  'relative z-10 inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5',
  'rounded-md border border-transparent px-3 py-0.5 text-sm font-medium whitespace-nowrap',
  'text-foreground/60 transition-colors outline-none',
  'hover:text-foreground',
  'focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50',
  'focus-visible:outline-1 focus-visible:outline-ring',
  'disabled:pointer-events-none disabled:opacity-50',
  'has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2',
  'data-[state=active]:text-foreground',
  "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
);

const SLIDE_TWEEN = { duration: 0.24, ease: 'power3.out' } as const;

type TriggerRects = {
  x: number;
  y: number;
  width: number;
  height: number;
};

function useSlidingHighlight(value: string, optionValues: string) {
  const listRef = React.useRef<HTMLDivElement>(null);
  const highlightRef = React.useRef<HTMLSpanElement>(null);
  const triggers = React.useRef(new Map<string, HTMLButtonElement>());
  const current = React.useRef(value);
  const measured = React.useRef(false);

  React.useLayoutEffect(() => {
    current.current = value;
  }, [value]);

  const registerTrigger = React.useCallback(
    (optionValue: string) => (node: HTMLButtonElement | null) => {
      if (node) {
        triggers.current.set(optionValue, node);
      } else {
        triggers.current.delete(optionValue);
      }
    },
    []
  );

  const moveTo = React.useCallback((nextValue: string, animate: boolean) => {
    const list = listRef.current;
    const highlight = highlightRef.current;
    if (!list || !highlight) return;

    const trigger = triggers.current.get(nextValue);
    gsap.killTweensOf(highlight);
    if (!trigger) {
      measured.current = false;
      gsap.set(highlight, { opacity: 0 });
      return;
    }

    const rect: TriggerRects & { opacity: number } = {
      x: trigger.offsetLeft,
      y: trigger.offsetTop,
      width: trigger.offsetWidth,
      height: trigger.offsetHeight,
      opacity: 1,
    };
    if (animate && measured.current && !motionReduced()) {
      gsap.to(highlight, { ...rect, ...SLIDE_TWEEN });
    } else {
      gsap.set(highlight, rect);
      measured.current = true;
    }
  }, []);

  React.useLayoutEffect(() => {
    moveTo(value, true);
  }, [moveTo, optionValues, value]);

  React.useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const observer = new ResizeObserver(() => moveTo(current.current, false));
    observer.observe(list);
    triggers.current.forEach((trigger) => observer.observe(trigger));
    return () => observer.disconnect();
  }, [moveTo, optionValues]);

  React.useEffect(
    () => () => {
      if (highlightRef.current) gsap.killTweensOf(highlightRef.current);
    },
    []
  );

  return { listRef, highlightRef, registerTrigger };
}

function SegmentedTrigger<TValue extends string>({
  option,
  register,
  className,
}: {
  option: AnimatedSegmentedTabsOption<TValue>;
  register: (node: HTMLButtonElement | null) => void;
  className?: string;
}) {
  const trigger = (
    <TabsPrimitive.Trigger
      ref={register}
      value={option.value}
      disabled={option.disabled}
      data-slot="animated-segmented-tabs-trigger"
      className={cn(TRIGGER_STYLE, className)}>
      {option.label}
    </TabsPrimitive.Trigger>
  );
  if (!option.tooltip) return trigger;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{trigger}</TooltipTrigger>
      <TooltipContent side="top" sideOffset={6}>
        {option.tooltip}
      </TooltipContent>
    </Tooltip>
  );
}

export function AnimatedSegmentedTabs<TValue extends string = string>({
  label,
  options,
  value,
  onValueChange,
  children,
  className,
  listClassName,
  triggerClassName,
  highlightClassName,
  renderList,
  ...props
}: AnimatedSegmentedTabsProps<TValue>) {
  const optionValues = React.useMemo(
    () => options.map((option) => option.value).join(''),
    [options]
  );
  const { listRef, highlightRef, registerTrigger } = useSlidingHighlight(value, optionValues);

  const handleChange = React.useCallback(
    (nextValue: string) => {
      const option = options.find((item) => item.value === nextValue);
      if (option) onValueChange(option.value);
    },
    [options, onValueChange]
  );

  const list = (
    <TabsPrimitive.List
      ref={listRef}
      aria-label={label}
      data-slot="animated-segmented-tabs-list"
      className={cn(LIST_STYLE, listClassName)}>
      <span
        ref={highlightRef}
        aria-hidden="true"
        data-slot="animated-segmented-tabs-highlight"
        className={cn(HIGHLIGHT_STYLE, highlightClassName)}
      />
      <TooltipProvider>
        {options.map((option) => (
          <SegmentedTrigger
            key={option.value}
            option={option}
            register={registerTrigger(option.value)}
            className={triggerClassName}
          />
        ))}
      </TooltipProvider>
    </TabsPrimitive.List>
  );

  return (
    <TabsPrimitive.Root
      data-slot="animated-segmented-tabs"
      value={value}
      onValueChange={handleChange}
      className={cn('shrink-0', className)}
      {...props}>
      {renderList?.(list) ?? list}
      {children}
    </TabsPrimitive.Root>
  );
}
