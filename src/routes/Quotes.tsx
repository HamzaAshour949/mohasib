import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useEffect, useState } from 'react';
import { api } from '../lib/ipc';
import type { Item, Party, Warehouse, Cashbox } from '@shared/types';
import { Btn, Input, Label, Modal, Page, Select, Table } from '../components/ui';
import { formatMoney, majorToMinor, today } from '../lib/money';
import { describeError } from '../lib/errors';
import { confirmDiscard, useDirtyDocument } from '../lib/dirty';
import { useBaseCurrency } from '../lib/settings';

interface Quote {
  id: number; kind: 'sale' | 'purchase'; serial: string; date: string; validUntil: string | null;
  partyId: number; partyName: string;
  currency: string; subtotalMinor: string; discountMinor: string; feesMinor: string;
  grandTotalMinor: string; status: string; notes: string | null;
}
interface Line { itemId: number; qty: string; unitMajor: string; discMajor: string }

export default function QuotesPage(): JSX.Element {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<'sale' | 'purchase' | ''>('');
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<'sale' | 'purchase'>('sale');
  const [date, setDate] = useState(today());
  const [validUntil, setValidUntil] = useState('');
  const [partyId, setPartyId] = useState<number | ''>('');
  const baseCurrency = useBaseCurrency();
  const [currency, setCurrency] = useState(baseCurrency);
  // Settings arrive after the first render; adopt the company currency then,
  // unless the user has already chosen something else on this document.
  const [currencyTouched, setCurrencyTouched] = useState(false);
  useEffect(() => { if (!currencyTouched) setCurrency(baseCurrency); setCurrencyTouched(false); }, [baseCurrency, currencyTouched]);
  const [discMajor, setDiscMajor] = useState('0');
  const [feesMajor, setFeesMajor] = useState('0');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<Line[]>([]);

  const { data = [] } = useQuery<Quote[]>({ queryKey: ['quotes', filter], queryFn: () => api.quotes.list(filter || undefined) as Promise<Quote[]> });
  const { data: parties = [] } = useQuery<Party[]>({ queryKey: ['parties'], queryFn: () => api.parties.list() as Promise<Party[]> });
  const { data: items = [] } = useQuery<Item[]>({ queryKey: ['items'], queryFn: () => api.items.list() as Promise<Item[]> });
  const { data: warehouses = [] } = useQuery<Warehouse[]>({ queryKey: ['warehouses'], queryFn: () => api.warehouses.list() as Promise<Warehouse[]> });
  const { data: cashboxes = [] } = useQuery<Cashbox[]>({ queryKey: ['cashboxes'], queryFn: () => api.cashboxes.list() as Promise<Cashbox[]> });

  const [convertId, setConvertId] = useState<number | null>(null);
  const [convWh, setConvWh] = useState<number>(0);
  const [convPay, setConvPay] = useState<'cash' | 'credit'>('credit');
  const [convCb, setConvCb] = useState<number>(0);

  const reset = (): void => {
    setKind('sale'); setDate(today()); setValidUntil(''); setPartyId(''); setCurrency(baseCurrency); setCurrencyTouched(false);
    setDiscMajor('0'); setFeesMajor('0'); setNotes(''); setLines([]);
  };
  // Losing a half-entered document because a modal was dismissed is the kind
  // of thing people only notice after it happens. The same prompt guards the
  // window close, so the two cannot disagree.
  const dirty = open && (lines.length > 0 || notes !== '' || discMajor !== '0' || feesMajor !== '0');
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
    if (!partyId || lines.length === 0) { alert(t('partyAndOneLineRequired')); return; }
    const r = await api.quotes.save({
      kind, date, validUntil: validUntil || null, partyId: Number(partyId), currency,
      lines: lines.map(l => ({ itemId: l.itemId, qty: l.qty,
        unitPriceMinor: majorToMinor(l.unitMajor), discountMinor: majorToMinor(l.discMajor) })),
      discountMinor: majorToMinor(discMajor), feesMinor: majorToMinor(feesMajor), notes
    }) as { ok: boolean; error?: string };
    if (!r.ok) { alert(describeError(t, r)); return; }
    setOpen(false); reset();
    void qc.invalidateQueries({ queryKey: ['quotes'] });
  };

  const cancel = async (id: number): Promise<void> => {
    if (!confirm(t('confirm'))) return;
    await api.quotes.cancel(id);
    void qc.invalidateQueries({ queryKey: ['quotes'] });
  };

  const startConvert = (id: number): void => {
    setConvertId(id);
    setConvWh(warehouses.find(w => w.isDefault)?.id ?? warehouses[0]?.id ?? 0);
    setConvPay('credit');
    setConvCb(cashboxes.find(c => c.isDefault)?.id ?? cashboxes[0]?.id ?? 0);
  };
  const doConvert = async (): Promise<void> => {
    if (!convertId || !convWh) { alert(t('warehouseRequired')); return; }
    const r = await api.docConvert.quote({
      id: convertId, warehouseId: convWh, paymentMode: convPay,
      cashboxId: convPay === 'cash' ? convCb : null
    }) as { ok: boolean; error?: string; id?: number };
    if (!r.ok) { alert(describeError(t, r)); return; }
    setConvertId(null);
    void qc.invalidateQueries({ queryKey: ['quotes'] });
    void qc.invalidateQueries({ queryKey: ['invoices'] });
  };

  return (
    <Page title={t('quotes')} toolbar={
      <div className="flex gap-2">
        <Select value={filter} onChange={e => setFilter(e.target.value as 'sale' | 'purchase' | '')}>
          <option value="">{t('actions')}</option>
          <option value="sale">{t('sale' as never, t('sale')) || 'Sale'}</option>
          <option value="purchase">{t('purchase' as never, t('purchase')) || 'Purchase'}</option>
        </Select>
        <Btn onClick={() => { void openEditor(); }}>{t('new')}</Btn>
      </div>
    }>
      <Table<Quote>
        rows={data}
        cols={[
          { key: 'serial', header: t('reference'), className: 'w-32 ltr-num' },
          { key: 'date', header: t('date'), className: 'w-28 ltr-num' },
          { key: 'kind', header: t('type') },
          { key: 'partyName', header: t('party') },
          { key: 'grandTotalMinor', header: t('grandTotal'), className: 'ltr-num text-end',
            render: r => formatMoney(r.grandTotalMinor, r.currency) },
          { key: 'status', header: t('status'), render: r => t(r.status) },
          { key: 'actions', header: t('actions'), className: 'w-56 text-end',
            render: r => r.status === 'open' ? <>
              <Btn variant="ghost" onClick={() => startConvert(r.id)}>{t('convert')}</Btn>{' '}
              <Btn variant="danger" onClick={() => cancel(r.id)}>{t('cancel')}</Btn>
            </> : null }
        ]}
      />
      <Modal open={open} dirty={dirty} dirtyLabel={t('unsavedChanges')} onClose={() => { void closeEditor(); }} title={t('new')} wide>
        <div className="grid grid-cols-4 gap-3">
          <div><Label>{t('type')}</Label>
            <Select value={kind} onChange={e => setKind(e.target.value as 'sale' | 'purchase')}>
              <option value="sale">Sale</option><option value="purchase">Purchase</option>
            </Select>
          </div>
          <div><Label>{t('date')}</Label><Input type="date" className="ltr-num" value={date} onChange={e => setDate(e.target.value)} /></div>
          <div><Label>Valid until</Label><Input type="date" className="ltr-num" value={validUntil} onChange={e => setValidUntil(e.target.value)} /></div>
          <div><Label>{t('party')}</Label>
            <Select value={partyId} onChange={e => setPartyId(e.target.value ? Number(e.target.value) : '')}>
              <option value="">—</option>
              {parties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </div>
          <div><Label>{t('currency')}</Label><Input value={currency} onChange={e => { setCurrencyTouched(true); setCurrency(e.target.value); }} /></div>
        </div>
        <div className="mt-4 flex items-center gap-2">
          <h3 className="text-sm font-semibold">{t('item')}</h3>
          <Btn variant="ghost" onClick={() => setLines([...lines, { itemId: items[0]?.id ?? 0, qty: '1', unitMajor: '0', discMajor: '0' }])}>+ {t('add')}</Btn>
        </div>
        <table className="w-full text-sm mt-2">
          <thead className="text-fg2 text-xs">
            <tr><th className="text-start py-1">{t('item')}</th><th className="text-end ltr-num w-24">{t('qty')}</th>
              <th className="text-end ltr-num w-32">{t('unitPrice')}</th><th className="text-end ltr-num w-32">{t('discount')}</th><th className="w-10" /></tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={i} className="border-t border-line">
                <td><Select className="w-full" value={l.itemId} onChange={e => setLines(lines.map((x, idx) => idx === i ? { ...x, itemId: Number(e.target.value) } : x))}>
                  {items.map(it => <option key={it.id} value={it.id}>{it.code} — {it.name}</option>)}
                </Select></td>
                <td><Input className="ltr-num text-end w-full" value={l.qty} onChange={e => setLines(lines.map((x, idx) => idx === i ? { ...x, qty: e.target.value } : x))} /></td>
                <td><Input className="ltr-num text-end w-full" value={l.unitMajor} onChange={e => setLines(lines.map((x, idx) => idx === i ? { ...x, unitMajor: e.target.value } : x))} /></td>
                <td><Input className="ltr-num text-end w-full" value={l.discMajor} onChange={e => setLines(lines.map((x, idx) => idx === i ? { ...x, discMajor: e.target.value } : x))} /></td>
                <td className="text-end"><button className="text-rose-400" onClick={() => setLines(lines.filter((_, idx) => idx !== i))}>×</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="grid grid-cols-3 gap-3 mt-3">
          <div><Label>{t('discount')}</Label><Input className="ltr-num text-end" value={discMajor} onChange={e => setDiscMajor(e.target.value)} /></div>
          <div><Label>{t('fees')}</Label><Input className="ltr-num text-end" value={feesMajor} onChange={e => setFeesMajor(e.target.value)} /></div>
          <div className="col-span-3"><Label>{t('notes')}</Label><Input value={notes} onChange={e => setNotes(e.target.value)} /></div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <Btn variant="ghost" onClick={() => { void closeEditor(); }}>{t('cancel')}</Btn>
          <Btn onClick={save}>{t('save')}</Btn>
        </div>
      </Modal>
      <Modal open={convertId != null} onClose={() => setConvertId(null)} title={t('convert')}>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>{t('warehouse')}</Label>
            <Select value={convWh} onChange={e => setConvWh(Number(e.target.value))}>
              <option value={0}>—</option>
              {warehouses.map(w => <option key={w.id} value={w.id}>{w.code} — {w.name}</option>)}
            </Select>
          </div>
          <div><Label>{t('paymentMode')}</Label>
            <Select value={convPay} onChange={e => setConvPay(e.target.value as 'cash' | 'credit')}>
              <option value="credit">{t('credit')}</option>
              <option value="cash">{t('cash')}</option>
            </Select>
          </div>
          {convPay === 'cash' && (
            <div className="col-span-2"><Label>{t('cashbox')}</Label>
              <Select value={convCb} onChange={e => setConvCb(Number(e.target.value))}>
                <option value={0}>—</option>
                {cashboxes.map(c => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
              </Select>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <Btn variant="ghost" onClick={() => setConvertId(null)}>{t('cancel')}</Btn>
          <Btn onClick={doConvert}>{t('convert')}</Btn>
        </div>
      </Modal>
    </Page>
  );
}
