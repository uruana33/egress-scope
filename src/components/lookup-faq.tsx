import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { t } from '@/i18n';

export function LookupFaq({
  items,
  quiet = false,
}: {
  items: { title: string; text: string }[];
  quiet?: boolean;
}) {
  const body = (
    <Accordion type="single" collapsible>
      {items.map((item) => (
        <AccordionItem key={item.title} value={item.title} className="border-0">
          <AccordionTrigger className="gap-3 px-2 py-1.5 text-[13px] font-medium hover:bg-muted/60 hover:no-underline">
            {item.title}
          </AccordionTrigger>
          <AccordionContent className="px-2 pb-3">
            <p className="whitespace-pre-line text-xs leading-5 text-muted-foreground">
              {item.text}
            </p>
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );

  if (quiet) {
    return (
      <section className="lookup-faq lookup-faq-quiet" aria-label={t('常见问题')}>
        <h2 className="lookup-faq-title">{t('常见问题')}</h2>
        {body}
      </section>
    );
  }

  return (
    <section className="lookup-faq" aria-label={t('常见问题')}>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {t('常见问题')} <span className="text-xs font-normal text-muted-foreground">FAQ</span>
          </CardTitle>
        </CardHeader>
        <CardContent>{body}</CardContent>
      </Card>
    </section>
  );
}
