import { t } from '@/i18n';

import type { ipProfileFields } from './profile-fields';

export type ProfileField = ReturnType<typeof ipProfileFields>[number];

export function FieldCatalog({ field }: { field: ProfileField }) {
  return (
    <>
      <div className="ip-profile-current">
        <span>{t('当前 IP')}</span>
        <strong>{field.value}</strong>
        {field.detail && <p>{field.detail}</p>}
      </div>
      <dl className="ip-profile-catalog">
        {field.options.map((option) => (
          <div key={option.label} data-current={option.current || undefined}>
            <dt>
              <strong>{option.label}</strong>
              {option.status ? (
                <span>{option.status}</span>
              ) : (
                option.current && <span>{t('当前归类')}</span>
              )}
            </dt>
            <dd>{option.description}</dd>
          </div>
        ))}
      </dl>
    </>
  );
}
