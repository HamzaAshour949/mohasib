import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { api } from '../lib/ipc';
import type { Account } from '@shared/types';
import { Btn, Input, Label, Modal, Page, Select, Table } from '../components/ui';
import { formatMoney, majorToMinor } from '../lib/money';

interface BudgetRow {
  id: number; accountId: number; period: string; amountMinor: string; notes: string | null;
  accountCode: string; accountName: string; accountType: string;
}

export default function BudgetsPage(): JSX.Element {
  const { t } = useTranslation();
  const tn = useTranslation('nav').t;
  const qc = useQueryClient();
  const currentMonth = new Date().toISOString().slice(0, 7);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Partial<BudgetRow>>({ period: currentMonth, amountMinor: '0' });
  const [amountMajor, setAmountMajor] = useState('0');

  const { data = [] } = useQuery<BudgetRow[]>({ queryKey: ['budgets'], queryFn: () => api.budgets.list() as Promise<BudgetRow[]> });
  const { data: accounts = [] } = useQuery<Account[]>({ queryKey: ['accounts'], queryFn: () => api.accounts.list() as Promise<Account[]> });
  const leafAccounts = accounts.filter(a => a.isActive === 1);

  const save = async (): Promise<void> => {
    const r = await api.budgets.save({
      ...editing,
      accountId: Number(editing.accountId),
      amountMinor: majorToMinor(amountMajor)
    }) as { ok: boolean; error?: string };
    if (!r.ok) { alert(r.error ?? t('error')); return; }
    setOpen(false); setEditing({ period: currentMonth, amountMinor: '0' }); setAmountMajor('0');
    void qc.invalidateQueries({ queryKey: ['budgets'] });
  };
  const remove = async (id: number): Promise<void> => {
    if (!confirm(t('confirmDelete'))) return;
    await api.budgets.delete(id);
    void qc.invalidateQueries({ queryKey: ['budgets'] });
  };

  return (
    <Page title={tn('budgets')} toolbar={<Btn onClick={() => { setEditing({ period: currentMonth }); setAmountMajor('0'); setOpen(true); }}>{t('add')}</Btn>}>
      <Table<BudgetRow>
        rows={data}
        cols={[
          { key: 'period', header: t('period'), className: 'ltr-num w-28' },
          { key: 'accountCode', header: t('account'), className: 'ltr-num w-28', render: r => `${r.accountCode} — ${r.accountName}` },
          { key: 'amountMinor', header: t('budget'), className: 'ltr-num text-end', render: r => formatMoney(r.amountMinor) },
          { key: 'notes', header: t('notes') },
          { key: 'actions', header: t('actions'), className: 'w-44 text-end', render: r => <>
            <Btn variant="ghost" onClick={() => { setEditing(r); setAmountMajor((Number(r.amountMinor) / 100).toString()); setOpen(true); }}>{t('edit')}</Btn>{' '}
            <Btn variant="danger" onClick={() => remove(r.id)}>{t('delete')}</Btn>
          </> }
        ]}
      />
      <Modal open={open} onClose={() => setOpen(false)} title={editing.id ? t('edit') : t('add')}>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>{t('period')}</Label><Input type="month" className="ltr-num" value={editing.period ?? currentMonth} onChange={e => setEditing({ ...editing, period: e.target.value })} /></div>
          <div><Label>{t('amount')}</Label><Input className="ltr-num" value={amountMajor} onChange={e => setAmountMajor(e.target.value)} /></div>
          <div className="col-span-2"><Label>{t('account')}</Label>
            <Select className="w-full" value={editing.accountId ?? 0} onChange={e => setEditing({ ...editing, accountId: Number(e.target.value) })}>
              <option value={0}>—</option>
              {leafAccounts.map(a => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
            </Select>
          </div>
          <div className="col-span-2"><Label>{t('notes')}</Label><Input value={editing.notes ?? ''} onChange={e => setEditing({ ...editing, notes: e.target.value })} /></div>
        </div>
        <div className="flex justify-end gap-2 mt-4"><Btn variant="ghost" onClick={() => setOpen(false)}>{t('cancel')}</Btn><Btn onClick={save}>{t('save')}</Btn></div>
      </Modal>
    </Page>
  );
}