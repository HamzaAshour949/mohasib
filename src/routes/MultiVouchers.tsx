import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useEffect, useState } from 'react';
import { api } from '../lib/ipc';
import type { Cashbox, Party } from '@shared/types';
import { Btn, Input, Label, Modal, Page, Select, Table } from '../components/ui';
import { formatMoney, majorToMinor, today } from '../lib/money';
import { describeError } from '../lib/errors';
import { confirmDiscard, useDirtyDocument } from '../lib/dirty';
import { useBaseCurrency } from '../lib/settings';

interface MultiVoucher {
  id: number; kind: 'receipt' | 'payment'; serial: string; date: string;
  cashboxId: number; cashboxName: string; currency: string; totalMinor: string;
  notes: string | null; journalId: number | null;
}

interface MLine { partyId: number | ''; amountMajor: string; memo: string }

export default function MultiVouchersPage(): JSX.Element {
  const { t } = useTranslation();
  const tn = useTranslation('nav').t;
  const qc = useQueryClient();

  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<'receipt' | 'payment'>('receipt');
  const [date, setDate] = useState(today());
  const [cashboxId, setCashboxId] = useState<number | ''>('');
  const baseCurrency = useBaseCurrency();
  const [currency, setCurrency] = useState(baseCurrency);
  // Settings arrive after the first render; adopt the company currency then,
  // unless the user has already chosen something else on this document.
  const [currencyTouched, setCurrencyTouched] = useState(false);
  useEffect(() => { if (!currencyTouched) setCurrency(baseCurrency); setCurrencyTouched(false); }, [baseCurrency, currencyTouched]);
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<MLine[]>([]);

  const { data = [] } = useQuery<MultiVoucher[]>({ queryKey: ['mvouchers'], queryFn: () => api.multiVouchers.list() as Promise<MultiVoucher[]> });
  const { data: parties = [] } = useQuery<Party[]>({ queryKey: ['parties'], queryFn: () => api.parties.list() as Promise<Party[]> });
  const { data: cashboxes = [] } = useQuery<Cashbox[]>({ queryKey: ['cashboxes'], queryFn: () => api.cashboxes.list() as Promise<Cashbox[]> });

  const filtered = parties.filter(p => kind === 'receipt'
    ? (p.kind === 'customer' || p.kind === 'both')
    : (p.kind === 'supplier' || p.kind === 'both' || p.kind === 'employee'));

  const reset = (): void => {
    setKind('receipt'); setDate(today()); setCashboxId(''); setCurrency(baseCurrency); setCurrencyTouched(false);
    setNotes(''); setLines([]);
  };
  // Losing a half-entered document because a modal was dismissed is the kind
  // of thing people only notice after it happens. The same prompt guards the
  // window close, so the two cannot disagree.
  const dirty = open && (lines.length > 0 || notes !== '');
  useDirtyDocument(dirty);

  const closeEditor = async (): Promise<void> => {
    if (dirty && !(await confirmDiscard())) return;
    setOpen(false);
    reset();
  };

  const openEditor = async (): Promise<void> => {
    if (dirty && !(await confirmDiscard())) return;
    reset();
    setOpen(true);
  };


  const save = async (): Promise<void> => {
    if (!cashboxId) { alert(t('cashboxRequired')); return; }
    if (lines.length === 0 || lines.some(l => !l.partyId || !l.amountMajor)) {
      alert(t('atLeastOnePartyLine')); return;
    }
    const r = await api.multiVouchers.save({
      kind, date, cashboxId: Number(cashboxId), currency, notes,
      lines: lines.map(l => ({ partyId: Number(l.partyId), amountMinor: majorToMinor(l.amountMajor), memo: l.memo || null }))
    }) as { ok: boolean; error?: string };
    if (!r.ok) { alert(describeError(t, r)); return; }
    setOpen(false); reset();
    void qc.invalidateQueries({ queryKey: ['mvouchers'] });
  };

  return (
    <Page title={tn('multiVouchers')} toolbar={<Btn onClick={() => { void openEditor(); }}>{t('new')}</Btn>}>
      <Table<MultiVoucher>
        rows={data}
        cols={[
          { key: 'serial', header: t('reference'), className: 'ltr-num w-32' },
          { key: 'date', header: t('date'), className: 'ltr-num w-28' },
          { key: 'kind', header: t('type'), render: r => r.kind === 'receipt' ? t('receipt') : t('payment') },
          { key: 'cashboxName', header: t('cashbox') },
          { key: 'totalMinor', header: t('amount'), className: 'text-end ltr-num',
            render: r => formatMoney(r.totalMinor, r.currency) }
        ]}
      />
      <Modal open={open} dirty={dirty} dirtyLabel={t('unsavedChanges')} onClose={() => { void closeEditor(); }} title={t('new')} wide>
        <div className="grid grid-cols-4 gap-3">
          <div><Label>{t('type')}</Label>
            <Select value={kind} onChange={e => setKind(e.target.value as 'receipt' | 'payment')}>
              <option value="receipt">{t('receipt')}</option>
              <option value="payment">{t('payment')}</option>
            </Select>
          </div>
          <div><Label>{t('date')}</Label><Input type="date" className="ltr-num" value={date} onChange={e => setDate(e.target.value)} /></div>
          <div><Label>{t('cashbox')}</Label>
            <Select value={cashboxId} onChange={e => setCashboxId(e.target.value ? Number(e.target.value) : '')}>
              <option value="">—</option>
              {cashboxes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </div>
          <div><Label>{t('currency')}</Label><Input value={currency} onChange={e => { setCurrencyTouched(true); setCurrency(e.target.value); }} /></div>
        </div>
        <div className="mt-4 flex items-center gap-2">
          <h3 className="text-sm font-semibold">{t('party')}</h3>
          <Btn variant="ghost" onClick={() => setLines([...lines, { partyId: '', amountMajor: '0', memo: '' }])}>+ {t('add')}</Btn>
        </div>
        <table className="w-full text-sm mt-2">
          <thead className="text-fg2 text-xs">
            <tr><th className="text-start py-1">{t('party')}</th>
              <th className="text-end ltr-num w-32">{t('amount')}</th>
              <th className="text-start">{t('notes')}</th>
              <th className="w-10" /></tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={i} className="border-t border-line">
                <td><Select className="w-full" value={l.partyId} onChange={e => setLines(lines.map((x, idx) => idx === i ? { ...x, partyId: e.target.value ? Number(e.target.value) : '' } : x))}>
                  <option value="">—</option>
                  {filtered.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </Select></td>
                <td><Input className="ltr-num text-end w-full" value={l.amountMajor} onChange={e => setLines(lines.map((x, idx) => idx === i ? { ...x, amountMajor: e.target.value } : x))} /></td>
                <td><Input className="w-full" value={l.memo} onChange={e => setLines(lines.map((x, idx) => idx === i ? { ...x, memo: e.target.value } : x))} /></td>
                <td className="text-end"><button className="text-rose-400" onClick={() => setLines(lines.filter((_, idx) => idx !== i))}>×</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-3"><Label>{t('notes')}</Label><Input value={notes} onChange={e => setNotes(e.target.value)} /></div>
        <div className="flex justify-end gap-2 mt-4">
          <Btn variant="ghost" onClick={() => { void closeEditor(); }}>{t('cancel')}</Btn>
          <Btn onClick={save}>{t('save')}</Btn>
        </div>
      </Modal>
    </Page>
  );
}
