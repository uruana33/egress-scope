import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

function TailTruncated({ text }: { text: string }) {
  if (text.length <= 20) {
    return <span className="compact-text-head">{text}</span>;
  }
  return (
    <>
      <span className="compact-text-head">{text.slice(0, -8)}</span>
      <span className="compact-text-tail">{text.slice(-8)}</span>
    </>
  );
}

export function CompactText({
  text,
  middle = false,
  tooltip = true,
}: {
  text: string;
  middle?: boolean;
  tooltip?: boolean;
}) {
  const body = (
    <span className="compact-text" tabIndex={tooltip ? 0 : undefined} aria-label={text}>
      {middle ? <TailTruncated text={text} /> : <span className="compact-text-head">{text}</span>}
    </span>
  );

  if (!tooltip) {
    return body;
  }

  return (
    <TooltipProvider delayDuration={250}>
      <Tooltip>
        <TooltipTrigger asChild>{body}</TooltipTrigger>
        <TooltipContent className="max-w-[min(32rem,90vw)] break-all" sideOffset={6}>
          {text}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
