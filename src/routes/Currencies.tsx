import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { api } from '../lib/ipc';
import { Btn, Input, Label, Modal, Page, Table } from '../components/ui';
import { today } from '../lib/money';
import { describeError } from '../lib/errors';

interface Currency { code: string; name: string; nameEn: string | null; symbol: string | null; isBase: number }
interface FxRate { id: number; currency: string; date: string; rate: string }

export default function CurrenciesPage(): JSX.Element {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Partial<Currency> & { original?: string }>({});
  const [fxOpen, setFxOpen] = useState(false);
  const [fxEditing, setFxEditing] = useState<Partial<FxRate>>({});

  const { data: ccys = [] } = useQuery<Currency[]>({ queryKey: ['currencies'], queryFn: () => api.currencies.list() as Promise<Currency[]> });
  const { data: fx = [] } = useQuery<FxRate[]>({ queryKey: ['fx'], queryFn: () => api.currencies.fxList() as Promise<FxRate[]> });

  const save = async (): Promise<void> => {
    const r = await api.currencies.save(editing) as { ok: boolean; error?: string };
    if (!r.ok) { alert(describeError(t, r)); return; }
    setOpen(false); setEditing({});
    void qc.invalidateQueries({ queryKey: ['currencies'] });
  };
  const remove = async (code: string): Promise<void> => {
    if (!confirm(t('confirmDelete'))) return;
    const r = await api.currencies.delete(code) as { ok: boolean; error?: string };
    if (!r.ok) { alert(describeError(t, r)); return; }
    void qc.invalidateQueries({ queryKey: ['currencies'] });
  };

  const fxSave = async (): Promise<void> => {
    const r = await api.currencies.fxSave(fxEditing) as { ok: boolean; error?: string };
    if (!r.ok) { alert(describeError(t, r)); return; }
    setFxOpen(false); setFxEditing({});
    void qc.invalidateQueries({ queryKey: ['fx'] });
  };
  const fxRemove = async (id: number): Promise<void> => {
    if (!confirm(t('confirmDelete'))) return;
    await api.currencies.fxDelete(id);
    void qc.invalidateQueries({ queryKey: ['fx'] });
  };

  return (
    <Page title={t('currencies')} toolbar={<Btn onClick={() => { setEditing({ isBase: 0 }); setOpen(true); }}>{t('add')}</Btn>}>
      <Table<Currency>
        rows={ccys}
        cols={[
          { key: 'code', header: t('code'), className: 'w-24 ltr-num' },
          { key: 'name', header: t('name') },
          { key: 'nameEn', header: 'Name (EN)' },
          { key: 'symbol', header: 'Symbol', className: 'w-20' },
          { key: 'isBase', header: 'Base', render: r => r.isBase ? '✓' : '', className: 'w-20' },
          { key: 'actions', header: t('actions'), className: 'w-48 text-end',
            render: r => <>
              <Btn variant="ghost" onClick={() => { setEditing({ ...r, original: r.code }); setOpen(true); }}>{t('edit')}</Btn>{' '}
              <Btn variant="danger" onClick={() => remove(r.code)}>{t('delete')}</Btn>
            </> }
        ]}
      />

      <div className="mt-6 flex items-center gap-3">
        <h3 className="text-lg font-semibold">FX rates</h3>
        <div className="flex-1" />
        <Btn onClick={() => { setFxEditing({ date: today(), currency: ccys.find(c => !c.isBase)?.code ?? '' }); setFxOpen(true); }}>{t('add')}</Btn>
      </div>
      <Table<FxRate>
        rows={fx}
        cols={[
          { key: 'date', header: t('date'), className: 'w-32 ltr-num' },
          { key: 'currency', header: t('currency'), className: 'w-24 ltr-num' },
          { key: 'rate', header: 'Rate', className: 'ltr-num text-end' },
          { key: 'actions', header: t('actions'), className: 'w-32 text-end',
            render: r => <Btn variant="danger" onClick={() => fxRemove(r.id)}>{t('delete')}</Btn> }
        ]}
      />

      <Modal open={open} onClose={() => setOpen(false)} title={editing.original ? t('edit') : t('add')}>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>{t('code')}</Label><Input value={editing.code ?? ''} onChange={e => setEditing({ ...editing, code: e.target.value.toUpperCase() })} /></div>
          <div><Label>Symbol</Label><Input value={editing.symbol ?? ''} onChange={e => setEditing({ ...editing, symbol: e.target.value })} /></div>
          <div className="col-span-2"><Label>{t('name')}</Label><Input value={editing.name ?? ''} onChange={e => setEditing({ ...editing, name: e.target.value })} /></div>
          <div className="col-span-2"><Label>Name (EN)</Label><Input value={editing.nameEn ?? ''} onChange={e => setEditing({ ...editing, nameEn: e.target.value })} /></div>
          <div><Label>Base</Label>
            <select value={editing.isBase ?? 0} onChange={e => setEditing({ ...editing, isBase: Number(e.target.value) })}
              className="bg-bg2 border border-line rounded-md px-2 py-1.5 text-sm w-full">
              <option value={0}>{t('no')}</option><option value={1}>{t('yes')}</option>
            </select>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <Btn variant="ghost" onClick={() => setOpen(false)}>{t('cancel')}</Btn>
          <Btn onClick={save}>{t('save')}</Btn>
        </div>
      </Modal>

      <Modal open={fxOpen} onClose={() => setFxOpen(false)} title="FX rate">
        <div className="grid grid-cols-2 gap-3">
          <div><Label>{t('date')}</Label><Input type="date" className="ltr-num" value={fxEditing.date ?? today()} onChange={e => setFxEditing({ ...fxEditing, date: e.target.value })} /></div>
          <div><Label>{t('currency')}</Label>
            <select value={fxEditing.currency ?? ''} onChange={e => setFxEditing({ ...fxEditing, currency: e.target.value })}
              className="bg-bg2 border border-line rounded-md px-2 py-1.5 text-sm w-full">
              {ccys.filter(c => !c.isBase).map(c => <option key={c.code} value={c.code}>{c.code} — {c.name}</option>)}
            </select>
          </div>
          <div className="col-span-2"><Label>Rate (in base)</Label><Input className="ltr-num" value={fxEditing.rate ?? ''} onChange={e => setFxEditing({ ...fxEditing, rate: e.target.value })} /></div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <Btn variant="ghost" onClick={() => setFxOpen(false)}>{t('cancel')}</Btn>
          <Btn onClick={fxSave}>{t('save')}</Btn>
        </div>
      </Modal>
    </Page>
  );
}
