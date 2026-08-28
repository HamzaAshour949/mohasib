import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useEffect, useState } from 'react';
import { api } from '../lib/ipc';
import type { Account, Cashbox, Party } from '@shared/types';
import { Btn, Input, Label, Modal, Page, Select, Table } from '../components/ui';
import { formatMoney, majorToMinor, today } from '../lib/money';
import { describeError } from '../lib/errors';
import { useBaseCurrency } from '../lib/settings';

interface Expense {
  id: number; serial: string; date: string; partyId: number | null; partyName: string | null;
  cashboxId: number; cashboxName: string;
  expenseAccountId: number; expenseAccountName: string;
  currency: string; amountMinor: string; notes: string | null;
  departmentId: number | null; projectId: number | null; funderId: number | null;
}

interface Dim { id: number; code: string; name: string }
interface ExpCat { id: number; code: string; name: string; accountId: number }

export default function ExpensesPage(): JSX.Element {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(today());
  const [expenseAccountId, setExpenseAccountId] = useState<number | ''>('');
  const [cashboxId, setCashboxId] = useState<number | ''>('');
  const [amountMajor, setAmountMajor] = useState('0');
  const baseCurrency = useBaseCurrency();
  const [currency, setCurrency] = useState(baseCurrency);
  // Settings arrive after the first render; adopt the company currency then,
  // unless the user has already chosen something else on this document.
  const [currencyTouched, setCurrencyTouched] = useState(false);
  useEffect(() => { if (!currencyTouched) setCurrency(baseCurrency); setCurrencyTouched(false); }, [baseCurrency, currencyTouched]);
  const [partyId, setPartyId] = useState<number | ''>('');
  const [departmentId, setDepartmentId] = useState<number | ''>('');
  const [projectId, setProjectId] = useState<number | ''>('');
  const [funderId, setFunderId] = useState<number | ''>('');
  const [notes, setNotes] = useState('');

  const { data = [] } = useQuery<Expense[]>({ queryKey: ['expenses'], queryFn: () => api.expenses.list() as Promise<Expense[]> });
  const { data: accounts = [] } = useQuery<Account[]>({ queryKey: ['accounts'], queryFn: () => api.accounts.list() as Promise<Account[]> });
  const { data: cashboxes = [] } = useQuery<Cashbox[]>({ queryKey: ['cashboxes'], queryFn: () => api.cashboxes.list() as Promise<Cashbox[]> });
  const { data: parties = [] } = useQuery<Party[]>({ queryKey: ['parties'], queryFn: () => api.parties.list() as Promise<Party[]> });
  const { data: cats = [] } = useQuery<ExpCat[]>({ queryKey: ['expCats'], queryFn: () => api.expenseCategories.list() as Promise<ExpCat[]> });
  const { data: depts = [] } = useQuery<Dim[]>({ queryKey: ['departments'], queryFn: () => api.departments.list() as Promise<Dim[]> });
  const { data: projs = [] } = useQuery<Dim[]>({ queryKey: ['projects'], queryFn: () => api.projects.list() as Promise<Dim[]> });
  const { data: funders = [] } = useQuery<Dim[]>({ queryKey: ['funders'], queryFn: () => api.funders.list() as Promise<Dim[]> });
  const expAccts = accounts.filter(a => a.type === 'expense');

  const reset = (): void => {
    setDate(today()); setExpenseAccountId(''); setCashboxId(cashboxes[0]?.id ?? '');
    setAmountMajor('0'); setCurrency(baseCurrency); setCurrencyTouched(false); setPartyId('');
    setDepartmentId(''); setProjectId(''); setFunderId(''); setNotes('');
  };

  const save = async (): Promise<void> => {
    if (!expenseAccountId || !cashboxId) { alert(t('accountAndCashboxRequired')); return; }
    const r = await api.expenses.save({
      date, expenseAccountId: Number(expenseAccountId), cashboxId: Number(cashboxId),
      amountMinor: majorToMinor(amountMajor), currency,
      partyId: partyId ? Number(partyId) : null,
      departmentId: departmentId ? Number(departmentId) : null,
      projectId: projectId ? Number(projectId) : null,
      funderId: funderId ? Number(funderId) : null,
      notes
    }) as { ok: boolean; error?: string };
    if (!r.ok) { alert(describeError(t, r)); return; }
    setOpen(false); reset();
    void qc.invalidateQueries({ queryKey: ['expenses'] });
  };

  return (
    <Page title={t('expenses')} toolbar={<Btn onClick={() => { reset(); setOpen(true); }}>{t('new')}</Btn>}>
      <Table<Expense>
        rows={data}
        cols={[
          { key: 'serial', header: t('reference'), className: 'w-32 ltr-num' },
          { key: 'date', header: t('date'), className: 'w-28 ltr-num' },
          { key: 'expenseAccountName', header: t('category') },
          { key: 'partyName', header: t('party') },
          { key: 'amountMinor', header: t('amount'), className: 'ltr-num text-end',
            render: r => formatMoney(r.amountMinor, r.currency) },
          { key: 'notes', header: t('notes') }
        ]}
      />
      <Modal open={open} onClose={() => setOpen(false)} title={t('new')} wide>
        <div className="grid grid-cols-3 gap-3">
          <div><Label>{t('date')}</Label><Input type="date" className="ltr-num" value={date} onChange={e => setDate(e.target.value)} /></div>
          <div><Label>{t('category')}</Label>
            <Select value={expenseAccountId} onChange={e => setExpenseAccountId(e.target.value ? Number(e.target.value) : '')}>
              <option value="">—</option>
              {cats.map(c => <option key={c.id} value={c.accountId}>{c.code} — {c.name}</option>)}
              <option disabled>—— {t('actions')} ——</option>
              {expAccts.map(a => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
            </Select>
          </div>
          <div><Label>{t('cashbox')}</Label>
            <Select value={cashboxId} onChange={e => setCashboxId(e.target.value ? Number(e.target.value) : '')}>
              <option value="">—</option>
              {cashboxes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </div>
          <div><Label>{t('amount')}</Label><Input className="ltr-num text-end" value={amountMajor} onChange={e => setAmountMajor(e.target.value)} /></div>
          <div><Label>{t('currency')}</Label><Input value={currency} onChange={e => { setCurrencyTouched(true); setCurrency(e.target.value); }} /></div>
          <div><Label>{t('party')}</Label>
            <Select value={partyId} onChange={e => setPartyId(e.target.value ? Number(e.target.value) : '')}>
              <option value="">—</option>
              {parties.filter(p => p.kind === 'supplier' || p.kind === 'both').map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </div>
          <div><Label>{t('department')}</Label>
            <Select value={departmentId} onChange={e => setDepartmentId(e.target.value ? Number(e.target.value) : '')}>
              <option value="">—</option>{depts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </Select>
          </div>
          <div><Label>{t('project')}</Label>
            <Select value={projectId} onChange={e => setProjectId(e.target.value ? Number(e.target.value) : '')}>
              <option value="">—</option>{projs.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </Select>
          </div>
          <div><Label>{t('funder')}</Label>
            <Select value={funderId} onChange={e => setFunderId(e.target.value ? Number(e.target.value) : '')}>
              <option value="">—</option>{funders.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </Select>
          </div>
          <div className="col-span-3"><Label>{t('notes')}</Label><Input value={notes} onChange={e => setNotes(e.target.value)} /></div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <Btn variant="ghost" onClick={() => setOpen(false)}>{t('cancel')}</Btn>
          <Btn onClick={save}>{t('save')}</Btn>
        </div>
      </Modal>
    </Page>
  );
}
