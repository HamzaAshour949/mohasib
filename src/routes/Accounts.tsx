import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { api } from '../lib/ipc';
import type { Account, AppSettings } from '@shared/types';
import { Btn, Card, Input, Label, Modal, Page, Select, Table } from '../components/ui';

export default function AccountsPage(): JSX.Element {
  const { t, i18n } = useTranslation();
  const tf = useTranslation('forms').t;
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Partial<Account>>({});

  const { data: accounts = [] } = useQuery<Account[]>({
    queryKey: ['accounts'],
    queryFn: () => api.accounts.list() as Promise<Account[]>
  });
  const { data: settings } = useQuery<AppSettings>({ queryKey: ['settings'], queryFn: () => api.settings.get() as Promise<AppSettings> });

  const save = async () => {
    const payload = { ...editing, type: editing.type ?? 'asset', currency: editing.currency || settings?.defaultCurrency || 'USD' };
    const res = await api.accounts.save(payload) as { ok: boolean; id?: number; error?: string };
    if (!res.ok) { alert(res.error || t('error')); return; }
    setOpen(false); setEditing({});
    void qc.invalidateQueries({ queryKey: ['accounts'] });
  };

  const remove = async (id: number) => {
    if (!confirm(t('delete') + '?')) return;
    const res = await api.accounts.delete(id) as { ok: boolean; error?: string };
    if (!res.ok) alert(res.error || t('error'));
    else void qc.invalidateQueries({ queryKey: ['accounts'] });
  };

  return (
    <Page
      title={useTranslation('nav').t('accounts')}
      toolbar={<Btn onClick={() => { setEditing({}); setOpen(true); }}>{t('add')}</Btn>}
    >
      <Table<Account>
        rows={accounts}
        cols={[
          { key: 'code', header: t('code'), className: 'ltr-num w-24' },
          { key: 'name', header: t('name') },
          { key: 'type', header: t('type'), render: r => tf(r.type) },
          { key: 'currency', header: t('currency'), className: 'ltr-num w-20' },
          { key: 'actions', header: t('actions'), className: 'w-32 text-end',
            render: r => (
              <div className="flex justify-end gap-1">
                <Btn variant="ghost" onClick={() => { setEditing(r); setOpen(true); }}>{t('edit')}</Btn>
                <Btn variant="danger" onClick={() => remove(r.id)}>{t('delete')}</Btn>
              </div>
            )
          }
        ]}
      />

      <Modal open={open} onClose={() => setOpen(false)} title={editing.id ? t('edit') : t('add')}>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>{t('code')}</Label>
            <Input value={editing.code ?? ''} onChange={e => setEditing({ ...editing, code: e.target.value })} />
          </div>
          <div>
            <Label>{t('type')}</Label>
            <Select value={editing.type ?? 'asset'} onChange={e => setEditing({ ...editing, type: e.target.value as Account['type'] })}>
              {(['asset','liability','equity','revenue','expense'] as const).map(x => <option key={x} value={x}>{tf(x)}</option>)}
            </Select>
          </div>
          <div className="col-span-2">
            <Label>{i18n.language === 'ar' ? 'الاسم بالعربية' : 'Name (Arabic)'}</Label>
            <Input value={editing.name ?? ''} onChange={e => setEditing({ ...editing, name: e.target.value })} />
          </div>
          <div className="col-span-2">
            <Label>{i18n.language === 'ar' ? 'الاسم بالإنجليزية' : 'Name (English)'}</Label>
            <Input value={editing.nameEn ?? ''} onChange={e => setEditing({ ...editing, nameEn: e.target.value })} />
          </div>
          <div>
            <Label>{i18n.language === 'ar' ? 'الحساب الأب' : 'Parent code'}</Label>
            <Input value={editing.parentCode ?? ''} onChange={e => setEditing({ ...editing, parentCode: e.target.value })} />
          </div>
          <div>
            <Label>{t('currency')}</Label>
            <Input value={editing.currency ?? settings?.defaultCurrency ?? 'USD'} onChange={e => setEditing({ ...editing, currency: e.target.value })} />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <Btn variant="ghost" onClick={() => setOpen(false)}>{t('cancel')}</Btn>
          <Btn onClick={save}>{t('save')}</Btn>
        </div>
        <Card className="mt-3 text-xs text-fg2">{t('noTax')} · {t('noRiba')}</Card>
      </Modal>
    </Page>
  );
}
