import { useRef, useState } from 'react';

import { Info } from 'lucide-react';

import { ToolCard } from '@/components/toolkit';
import { Badge } from '@/components/ui/badge';
import { ResponsiveDialog } from '@/components/ui/responsive-dialog';
import { t } from '@/i18n';

import type { CoffeeIp } from './coffee';
import type { ipProfile } from './profile';
import { FieldCatalog } from './profile-catalog';
import { ipProfileFields } from './profile-fields';
import { ScenarioPanel } from './scenario-panel';
import { useFieldReveal } from './use-field-reveal';
import type { useIpLatency } from './use-ip-latency';

export default function IpProfileGraph({
  data,
  profile,
  inbound,
}: {
  inbound: ReturnType<typeof useIpLatency>;
  data: CoffeeIp;
  profile: ReturnType<typeof ipProfile>;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const fieldsRef = useRef<HTMLDListElement>(null);
  const fields = ipProfileFields(data, profile);
  const active = selected === null ? undefined : fields[selected];
  useFieldReveal(fieldsRef, data.ip);

  return (
    <>
      <ToolCard title={t('IP 画像')}>
        <dl ref={fieldsRef} className="ip-profile-fields">
          {fields.map((field, index) => (
            <div key={field.label}>
              <dt>
                <span>{field.label}</span>
                <button
                  type="button"
                  aria-label={t('解释 {0}', [field.label])}
                  onClick={() => setSelected(index)}>
                  <Info size={14} aria-hidden="true" />
                </button>
              </dt>
              <dd className="flex flex-wrap items-center gap-1">
                <Badge variant={field.tone ?? 'info'}>{field.value}</Badge>
                {field.special && <Badge variant="outline">{t('特殊类型')}</Badge>}
              </dd>
            </div>
          ))}
        </dl>
        <ResponsiveDialog
          open={active !== undefined}
          onOpenChange={(open) => {
            if (!open) setSelected(null);
          }}
          title={active?.label ?? ''}
          description={t('查看各类含义与当前 IP 的归类')}>
          {active && <FieldCatalog field={active} />}
        </ResponsiveDialog>
      </ToolCard>
      <ScenarioPanel ip={data.ip} inbound={inbound} />
    </>
  );
}
