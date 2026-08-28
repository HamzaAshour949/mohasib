import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { api } from '../lib/ipc';
import type { Account, Cashbox } from '@shared/types';
import { Btn, Input, Label, Modal, Page, Select, Table } from '../components/ui';
import { useNamesById } from '../lib/lookup';
import { describeError } from '../lib/errors';

export default function CashboxesPage(): JSX.Element {
  const { t } = useTranslation();
  const tn = useTranslation('nav').t;
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Partial<Cashbox>>({});

  const { data = [] } = useQuery<Cashbox[]>({ queryKey: ['cashboxes'], queryFn: () => api.cashboxes.list() as Promise<Cashbox[]> });
  const { data: accounts = [] } = useQuery<Account[]>({ queryKey: ['accounts'], queryFn: () => api.accounts.list() as Promise<Account[]> });
  const cashAccounts = accounts.filter(a => a.code === '1101' || a.code === '1102' || a.parentCode === '1101' || a.parentCode === '1102');
  const accountName = useNamesById(accounts, a => a.name);

  const save = async () => {
    const r = await api.cashboxes.save(editing) as { ok: boolean; error?: string };
    if (!r.ok) { alert(describeError(t, r)); return; }
    setOpen(false); setEditing({});
    void qc.invalidateQueries({ queryKey: ['cashboxes'] });
  };

  return (
    <Page title={tn('cashboxes')} toolbar={<Btn onClick={() => { setEditing({}); setOpen(true); }}>{t('add')}</Btn>}>
      <Table<Cashbox>
        rows={data}
        cols={[
          { key: 'code', header: t('code'), className: 'w-24 ltr-num' },
          { key: 'name', header: t('name') },
          { key: 'currency', header: t('currency'), className: 'w-20 ltr-num' },
          { key: 'accountId', header: 'Account',
            render: r => accountName(r.accountId) || String(r.accountId) },
          { key: 'actions', header: t('actions'), className: 'w-32 text-end',
            render: r => <Btn variant="ghost" onClick={() => { setEditing(r); setOpen(true); }}>{t('edit')}</Btn> }
        ]}
      />
      <Modal open={open} onClose={() => setOpen(false)} title={editing.id ? t('edit') : t('add')}>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>{t('code')}</Label><Input value={editing.code ?? ''} onChange={e => setEditing({ ...editing, code: e.target.value })} /></div>
          <div><Label>{t('currency')}</Label><Input value={editing.currency ?? 'USD'} onChange={e => setEditing({ ...editing, currency: e.target.value })} /></div>
          <div className="col-span-2"><Label>{t('name')}</Label><Input value={editing.name ?? ''} onChange={e => setEditing({ ...editing, name: e.target.value })} /></div>
          <div className="col-span-2">
            <Label>Account</Label>
            <Select className="w-full" value={editing.accountId ?? ''} onChange={e => setEditing({ ...editing, accountId: Number(e.target.value) })}>
              <option value="">—</option>
              {cashAccounts.map(a => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}
            </Select>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <Btn variant="ghost" onClick={() => setOpen(false)}>{t('cancel')}</Btn>
          <Btn onClick={save}>{t('save')}</Btn>
        </div>
      </Modal>
    </Page>
  );
}
