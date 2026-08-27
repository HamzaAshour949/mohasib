import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { api } from '../lib/ipc';
import type { Account, AppSettings } from '@shared/types';
import { Btn, Card, Input, Label, Modal, Page, Select, Table } from '../components/ui';
import { today } from '../lib/money';

interface PeriodLock { id: number; startDate: string; endDate: string; reason: string | null; lockedAt: string }
interface ExpCat { id: number; code: string; name: string; nameEn: string | null; accountId: number }

export default function SettingsPage(): JSX.Element {
  const { t, i18n } = useTranslation();
  const tn = useTranslation('nav').t;
  const qc = useQueryClient();
  const { data, isLoading } = useQuery<AppSettings>({ queryKey: ['settings'], queryFn: () => api.settings.get() as Promise<AppSettings> });
  const [s, setS] = useState<Partial<AppSettings>>({});
  const cur = { ...(data ?? {}), ...s } as AppSettings;

  if (isLoading || !data) return <Page title={tn('settings')}><div>{t('loading')}</div></Page>;

  const save = async () => {
    const r = await api.settings.save(s) as { ok: boolean; error?: string };
    if (!r.ok) { alert(r.error || t('error')); return; }
    setS({});
    void qc.invalidateQueries({ queryKey: ['settings'] });
    if (s.language && s.language !== i18n.language) {
      void i18n.changeLanguage(s.language);
      document.documentElement.lang = s.language;
      document.documentElement.dir = s.language === 'ar' ? 'rtl' : 'ltr';
      localStorage.setItem('lang', s.language);
    }
    alert(t('ok'));
  };

  return (
    <Page title={tn('settings')} toolbar={<Btn onClick={save}>{t('save')}</Btn>}>
      <Card>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>{t('company')} ({t('arabic')})</Label>
            <Input value={cur.companyName} onChange={e => setS({ ...s, companyName: e.target.value })} />
          </div>
          <div>
            <Label>{t('company')} (EN)</Label>
            <Input value={cur.companyNameEn} onChange={e => setS({ ...s, companyNameEn: e.target.value })} />
          </div>
          <div>
            <Label>{t('language')}</Label>
            <Select value={cur.language} onChange={e => setS({ ...s, language: e.target.value as 'ar'|'en' })}>
              <option value="ar">{t('arabic')}</option>
              <option value="en">{t('english')}</option>
            </Select>
          </div>
          <div>
            <Label>{t('currency')}</Label>
            <Input value={cur.defaultCurrency} onChange={e => setS({ ...s, defaultCurrency: e.target.value })} />
          </div>
          <div>
            <Label>{t('policy')}</Label>
            <Select value={cur.policyMode} onChange={e => setS({ ...s, policyMode: e.target.value as 'strict'|'warn' })}>
              <option value="strict">{t('policyStrict')}</option>
              <option value="warn">{t('policyWarn')}</option>
            </Select>
          </div>
          <div>
            <Label>Fiscal year start (MM-DD)</Label>
            <Input className="ltr-num" value={cur.fiscalYearStart} onChange={e => setS({ ...s, fiscalYearStart: e.target.value })} />
          </div>
          <div className="col-span-2">
            <Label>{t('groupNotes')}</Label>
            <textarea
              value={cur.groupNotes ?? ''}
              onChange={e => setS({ ...s, groupNotes: e.target.value })}
              rows={4}
              className="bg-bg2 border border-line rounded-md px-2 py-1.5 text-sm w-full"
              placeholder={t('groupNotesHelp')}
            />
          </div>
        </div>
      </Card>
      <Card className="mt-4 text-sm text-fg2 leading-relaxed">
        {i18n.language === 'ar'
          ? 'هذا التطبيق ملتزم بالمنهج السلفي ولا يدعم: الفوائد الربوية، الضرائب، أي مصاريف فائدة، أو أي حقول مرتبطة بها. الرسوم تعامَل كرسوم خدمات حلال محايدة.'
          : 'This application is built without riba/interest, taxes, or any related fields. "Fees" are treated as neutral halal service fees only.'}
      </Card>

      <PeriodLocksSection />
      <ExpenseCategoriesSection />
      <YearEndSection />
    </Page>
  );
}

const PeriodLocksSection: React.FC = () => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Partial<PeriodLock>>({});
  const { data = [] } = useQuery<PeriodLock[]>({ queryKey: ['periodLocks'], queryFn: () => api.periodLocks.list() as Promise<PeriodLock[]> });

  const save = async (): Promise<void> => {
    const r = await api.periodLocks.save(editing) as { ok: boolean; error?: string };
    if (!r.ok) { alert(r.error ?? t('error')); return; }
    setOpen(false); setEditing({});
    void qc.invalidateQueries({ queryKey: ['periodLocks'] });
  };
  const remove = async (id: number): Promise<void> => {
    if (!confirm(t('confirmDelete'))) return;
    await api.periodLocks.delete(id);
    void qc.invalidateQueries({ queryKey: ['periodLocks'] });
  };

  return (
    <Card className="mt-4">
      <div className="flex items-center mb-2">
        <h3 className="font-semibold">{t('periodLocks' as never, t('periodLocks')) || 'Period locks'}</h3>
        <div className="flex-1" />
        <Btn onClick={() => { setEditing({ startDate: today(), endDate: today() }); setOpen(true); }}>{t('add')}</Btn>
      </div>
      <Table<PeriodLock>
        rows={data}
        cols={[
          { key: 'startDate', header: t('from'), className: 'w-32 ltr-num' },
          { key: 'endDate', header: t('to'), className: 'w-32 ltr-num' },
          { key: 'reason', header: t('description') },
          { key: 'actions', header: t('actions'), className: 'w-32 text-end',
            render: r => <Btn variant="danger" onClick={() => remove(r.id)}>{t('delete')}</Btn> }
        ]}
      />
      <Modal open={open} onClose={() => setOpen(false)} title={t('add')}>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>{t('from')}</Label><Input type="date" className="ltr-num" value={editing.startDate ?? ''} onChange={e => setEditing({ ...editing, startDate: e.target.value })} /></div>
          <div><Label>{t('to')}</Label><Input type="date" className="ltr-num" value={editing.endDate ?? ''} onChange={e => setEditing({ ...editing, endDate: e.target.value })} /></div>
          <div className="col-span-2"><Label>{t('description')}</Label><Input value={editing.reason ?? ''} onChange={e => setEditing({ ...editing, reason: e.target.value })} /></div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <Btn variant="ghost" onClick={() => setOpen(false)}>{t('cancel')}</Btn>
          <Btn onClick={save}>{t('save')}</Btn>
        </div>
      </Modal>
    </Card>
  );
};

const ExpenseCategoriesSection: React.FC = () => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Partial<ExpCat>>({});
  const { data = [] } = useQuery<ExpCat[]>({ queryKey: ['expCats'], queryFn: () => api.expenseCategories.list() as Promise<ExpCat[]> });
  const { data: accounts = [] } = useQuery<Account[]>({ queryKey: ['accounts'], queryFn: () => api.accounts.list() as Promise<Account[]> });
  const expAccts = accounts.filter(a => a.type === 'expense');

  const save = async (): Promise<void> => {
    const r = await api.expenseCategories.save(editing) as { ok: boolean; error?: string };
    if (!r.ok) { alert(r.error ?? t('error')); return; }
    setOpen(false); setEditing({});
    void qc.invalidateQueries({ queryKey: ['expCats'] });
  };
  const remove = async (id: number): Promise<void> => {
    if (!confirm(t('confirmDelete'))) return;
    await api.expenseCategories.delete(id);
    void qc.invalidateQueries({ queryKey: ['expCats'] });
  };

  const acctName = (id: number): string => accounts.find(a => a.id === id)?.name ?? `#${id}`;

  return (
    <Card className="mt-4">
      <div className="flex items-center mb-2">
        <h3 className="font-semibold">Expense categories</h3>
        <div className="flex-1" />
        <Btn onClick={() => { setEditing({}); setOpen(true); }}>{t('add')}</Btn>
      </div>
      <Table<ExpCat>
        rows={data}
        cols={[
          { key: 'code', header: t('code'), className: 'w-24 ltr-num' },
          { key: 'name', header: t('name') },
          { key: 'accountId', header: 'Account', render: r => acctName(r.accountId) },
          { key: 'actions', header: t('actions'), className: 'w-48 text-end',
            render: r => <>
              <Btn variant="ghost" onClick={() => { setEditing(r); setOpen(true); }}>{t('edit')}</Btn>{' '}
              <Btn variant="danger" onClick={() => remove(r.id)}>{t('delete')}</Btn>
            </> }
        ]}
      />
      <Modal open={open} onClose={() => setOpen(false)} title={editing.id ? t('edit') : t('add')}>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>{t('code')}</Label><Input value={editing.code ?? ''} onChange={e => setEditing({ ...editing, code: e.target.value })} /></div>
          <div><Label>Account</Label>
            <select value={editing.accountId ?? ''} onChange={e => setEditing({ ...editing, accountId: Number(e.target.value) })}
              className="bg-bg2 border border-line rounded-md px-2 py-1.5 text-sm w-full">
              <option value="">—</option>
              {expAccts.map(a => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
            </select>
          </div>
          <div className="col-span-2"><Label>{t('name')}</Label><Input value={editing.name ?? ''} onChange={e => setEditing({ ...editing, name: e.target.value })} /></div>
          <div className="col-span-2"><Label>Name (EN)</Label><Input value={editing.nameEn ?? ''} onChange={e => setEditing({ ...editing, nameEn: e.target.value })} /></div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <Btn variant="ghost" onClick={() => setOpen(false)}>{t('cancel')}</Btn>
          <Btn onClick={save}>{t('save')}</Btn>
        </div>
      </Modal>
    </Card>
  );
};

const YearEndSection: React.FC = () => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [closeDate, setCloseDate] = useState(today());
  const [openDate, setOpenDate] = useState(today());
  const run = async (): Promise<void> => {
    if (!confirm(`${t('yearEndClose')} — ${closeDate}?`)) return;
    const r = await api.rollover.run({ closeDate, openDate }) as { ok: boolean; error?: string };
    if (!r.ok) { alert(r.error ?? t('error')); return; }
    alert(t('ok'));
    void qc.invalidateQueries();
  };
  return (
    <Card className="mt-4">
      <h3 className="font-semibold mb-2">{t('yearEndClose')}</h3>
      <div className="grid grid-cols-3 gap-3 items-end">
        <div><Label>Close date</Label><Input type="date" className="ltr-num" value={closeDate} onChange={e => setCloseDate(e.target.value)} /></div>
        <div><Label>Open date</Label><Input type="date" className="ltr-num" value={openDate} onChange={e => setOpenDate(e.target.value)} /></div>
        <div><Btn variant="danger" onClick={run}>{t('confirm')}</Btn></div>
      </div>
    </Card>
  );
};
