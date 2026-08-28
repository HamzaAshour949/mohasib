import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { api } from '../lib/ipc';
import type { Account } from '@shared/types';
import { Btn, Input, Label, Modal, Page, Table } from '../components/ui';
import { formatMoney, majorToMinor, minorToMajor, today } from '../lib/money';
import { describeError } from '../lib/errors';

interface Asset {
  id: number; code: string; name: string; nameEn: string | null; acqDate: string;
  costMinor: string; salvageMinor: string; usefulLifeMonths: number; method: string;
  assetAccountId: number; accumAccountId: number; expenseAccountId: number;
  accumulatedMinor: string; status: string; notes: string | null;
}

export default function AssetsPage(): JSX.Element {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Partial<Asset> & { costMajor?: string; salvageMajor?: string }>({});
  const [depOpen, setDepOpen] = useState<Asset | null>(null);
  const [depPeriod, setDepPeriod] = useState(today().slice(0, 7));
  const [depDate, setDepDate] = useState(today());

  const { data = [] } = useQuery<Asset[]>({ queryKey: ['assets'], queryFn: () => api.assets.list() as Promise<Asset[]> });
  const { data: accounts = [] } = useQuery<Account[]>({ queryKey: ['accounts'], queryFn: () => api.accounts.list() as Promise<Account[]> });
  const assetAccts = accounts.filter(a => a.type === 'asset');
  const expAccts = accounts.filter(a => a.type === 'expense');

  const startEdit = (a?: Asset): void => {
    if (a) setEditing({ ...a, costMajor: minorToMajor(a.costMinor), salvageMajor: minorToMajor(a.salvageMinor) });
    else setEditing({ acqDate: today(), usefulLifeMonths: 60, costMajor: '0', salvageMajor: '0',
      assetAccountId: assetAccts.find(x => x.code === '1210')?.id,
      accumAccountId: assetAccts.find(x => x.code === '1290')?.id,
      expenseAccountId: expAccts.find(x => x.code === '5240')?.id });
    setOpen(true);
  };

  const save = async (): Promise<void> => {
    const payload = { ...editing,
      costMinor: majorToMinor(editing.costMajor ?? '0'),
      salvageMinor: majorToMinor(editing.salvageMajor ?? '0')
    };
    const r = await api.assets.save(payload) as { ok: boolean; error?: string };
    if (!r.ok) { alert(describeError(t, r)); return; }
    setOpen(false); setEditing({});
    void qc.invalidateQueries({ queryKey: ['assets'] });
  };
  const remove = async (id: number): Promise<void> => {
    if (!confirm(t('confirmDelete'))) return;
    const r = await api.assets.delete(id) as { ok: boolean; error?: string };
    if (!r.ok) { alert(describeError(t, r)); return; }
    void qc.invalidateQueries({ queryKey: ['assets'] });
  };
  const depreciate = async (): Promise<void> => {
    if (!depOpen) return;
    const r = await api.assets.depreciate({ assetId: depOpen.id, period: depPeriod, date: depDate }) as { ok: boolean; error?: string };
    if (!r.ok) { alert(describeError(t, r)); return; }
    setDepOpen(null);
    void qc.invalidateQueries({ queryKey: ['assets'] });
  };

  return (
    <Page title={t('assets')} toolbar={<Btn onClick={() => startEdit()}>{t('add')}</Btn>}>
      <Table<Asset>
        rows={data}
        cols={[
          { key: 'code', header: t('code'), className: 'w-24 ltr-num' },
          { key: 'name', header: t('name') },
          { key: 'acqDate', header: t('date'), className: 'w-28 ltr-num' },
          { key: 'costMinor', header: 'Cost', className: 'ltr-num text-end', render: r => formatMoney(r.costMinor, 'USD') },
          { key: 'accumulatedMinor', header: 'Accumulated', className: 'ltr-num text-end', render: r => formatMoney(r.accumulatedMinor, 'USD') },
          { key: 'usefulLifeMonths', header: 'Life (mo)', className: 'ltr-num text-end' },
          { key: 'actions', header: t('actions'), className: 'w-72 text-end',
            render: r => <>
              <Btn variant="ghost" onClick={() => { setDepOpen(r); setDepPeriod(today().slice(0,7)); setDepDate(today()); }}>{t('depreciate')}</Btn>{' '}
              <Btn variant="ghost" onClick={() => startEdit(r)}>{t('edit')}</Btn>{' '}
              <Btn variant="danger" onClick={() => remove(r.id)}>{t('delete')}</Btn>
            </> }
        ]}
      />

      <Modal open={open} onClose={() => setOpen(false)} title={editing.id ? t('edit') : t('add')} wide>
        <div className="grid grid-cols-3 gap-3">
          <div><Label>{t('code')}</Label><Input value={editing.code ?? ''} onChange={e => setEditing({ ...editing, code: e.target.value })} /></div>
          <div className="col-span-2"><Label>{t('name')}</Label><Input value={editing.name ?? ''} onChange={e => setEditing({ ...editing, name: e.target.value })} /></div>
          <div><Label>Acquisition date</Label><Input type="date" className="ltr-num" value={editing.acqDate ?? ''} onChange={e => setEditing({ ...editing, acqDate: e.target.value })} /></div>
          <div><Label>Cost</Label><Input className="ltr-num text-end" value={editing.costMajor ?? '0'} onChange={e => setEditing({ ...editing, costMajor: e.target.value })} /></div>
          <div><Label>Salvage</Label><Input className="ltr-num text-end" value={editing.salvageMajor ?? '0'} onChange={e => setEditing({ ...editing, salvageMajor: e.target.value })} /></div>
          <div><Label>Useful life (months)</Label><Input className="ltr-num text-end" value={editing.usefulLifeMonths ?? 60} onChange={e => setEditing({ ...editing, usefulLifeMonths: Number(e.target.value) })} /></div>
          <div><Label>Asset account</Label>
            <select value={editing.assetAccountId ?? ''} onChange={e => setEditing({ ...editing, assetAccountId: Number(e.target.value) })}
              className="bg-bg2 border border-line rounded-md px-2 py-1.5 text-sm w-full">
              {assetAccts.map(a => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
            </select>
          </div>
          <div><Label>Accum. depreciation</Label>
            <select value={editing.accumAccountId ?? ''} onChange={e => setEditing({ ...editing, accumAccountId: Number(e.target.value) })}
              className="bg-bg2 border border-line rounded-md px-2 py-1.5 text-sm w-full">
              {assetAccts.map(a => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
            </select>
          </div>
          <div><Label>Expense account</Label>
            <select value={editing.expenseAccountId ?? ''} onChange={e => setEditing({ ...editing, expenseAccountId: Number(e.target.value) })}
              className="bg-bg2 border border-line rounded-md px-2 py-1.5 text-sm w-full">
              {expAccts.map(a => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
            </select>
          </div>
          <div className="col-span-3"><Label>{t('notes')}</Label><Input value={editing.notes ?? ''} onChange={e => setEditing({ ...editing, notes: e.target.value })} /></div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <Btn variant="ghost" onClick={() => setOpen(false)}>{t('cancel')}</Btn>
          <Btn onClick={save}>{t('save')}</Btn>
        </div>
      </Modal>

      <Modal open={!!depOpen} onClose={() => setDepOpen(null)} title={t('depreciate')}>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Period (YYYY-MM)</Label><Input className="ltr-num" value={depPeriod} onChange={e => setDepPeriod(e.target.value)} /></div>
          <div><Label>{t('date')}</Label><Input type="date" className="ltr-num" value={depDate} onChange={e => setDepDate(e.target.value)} /></div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <Btn variant="ghost" onClick={() => setDepOpen(null)}>{t('cancel')}</Btn>
          <Btn onClick={depreciate}>{t('confirm')}</Btn>
        </div>
      </Modal>
    </Page>
  );
}
