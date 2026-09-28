import { useEffect } from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import { Search } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { ActionButton } from '@/components/toolkit';
import { Field, FieldError, FieldGroup } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import { t } from '@/i18n';
import { cn } from '@/lib/utils';

const schema = z.object({
  query: z.string().trim().min(1, t('请输入查询内容')).max(253, t('输入过长')),
});
export function LookupForm({
  value = '',
  placeholder,
  busy,
  label = t('查询'),
  onSubmit,
  grouped = false,
  tone = 'default',
}: {
  grouped?: boolean;
  tone?: 'default' | 'display';
  value?: string;
  placeholder: string;
  busy: boolean;
  label?: string;
  onSubmit: (query: string) => void;
}) {
  const form = useForm<{ query: string }>({
    resolver: zodResolver(schema),
    defaultValues: { query: value },
  });
  useEffect(() => {
    form.reset({ query: value });
  }, [value, form]);
  const Container = grouped ? InputGroup : 'div';
  const Control = grouped ? InputGroupInput : Input;
  return (
    <form onSubmit={form.handleSubmit((data) => onSubmit(data.query))}>
      <FieldGroup>
        <Field data-invalid={!!form.formState.errors.query}>
          <Container
            className={cn(
              grouped && 'lookup-input-group',
              !grouped && 'lookup-form',
              tone === 'display' && 'lookup-form-display'
            )}>
            {grouped && tone === 'display' ? (
              <InputGroupAddon align="inline-start" className="lookup-form-lead">
                <Search aria-hidden="true" />
              </InputGroupAddon>
            ) : null}
            <Control
              aria-label={placeholder}
              placeholder={placeholder}
              aria-invalid={!!form.formState.errors.query}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              {...form.register('query')}
            />
            {grouped ? (
              <InputGroupAddon align="inline-end">
                <ActionButton className="h-8 min-w-14 px-3" size="sm" type="submit" busy={busy}>
                  {busy ? t('查询中...') : label}
                </ActionButton>
              </InputGroupAddon>
            ) : (
              <ActionButton type="submit" busy={busy}>
                {label}
              </ActionButton>
            )}
          </Container>
          <FieldError errors={[form.formState.errors.query]} />
        </Field>
      </FieldGroup>
    </form>
  );
}
