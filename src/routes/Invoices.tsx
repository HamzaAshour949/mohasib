import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useMemo, useState } from 'react';
import { api } from '../lib/ipc';
import type { Cashbox, Invoice, InvoiceKind, Item, Party, PaymentMode, Warehouse } from '@shared/types';
import { Btn, Input, Label, Modal, Page, Select, Table } from '../components/ui';
import { formatMoney, majorToMinor, minorToMajor, today } from '../lib/money';
import { exportRows } from '../lib/csv';
import { printHtml, escapeHtml } from '../lib/print';
import { useBarcodeScanner } from '../lib/barcode';
import { useIndexById, useNamesById } from '../lib/lookup';
import { describeError } from '../lib/errors';

interface EditorLine { itemId: number; qty: string; unitMajor: string; discountMajor: string; }

// Invoice kinds are already in the forms namespace; a private bilingual table
// meant they had to be translated twice and could drift apart.
const KIND_KEYS: Record<InvoiceKind, string> = {
  sale: 'sale',
  purchase: 'purchase',
  sale_return: 'saleReturn',
  purchase_return: 'purchaseReturn'
};
const INVOICE_KINDS = Object.keys(KIND_KEYS) as InvoiceKind[];

export default function InvoicesPage(): JSX.Element {
  const { t, i18n } = useTranslation();
  const tf = useTranslation('forms').t;
  const tn = useTranslation('nav').t;
  const qc = useQueryClient();

  const [filter, setFilter] = useState<InvoiceKind | ''>('');
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<InvoiceKind>('sale');
  const [date, setDate] = useState(today());
  const [partyId, setPartyId] = useState<number | ''>('');
  const [warehouseId, setWarehouseId] = useState<number | ''>('');
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('cash');
  const [cashboxId, setCashboxId] = useState<number | ''>('');
  const [currency, setCurrency] = useState('USD');
  const [lines, setLines] = useState<EditorLine[]>([]);
  const [invDiscMajor, setInvDiscMajor] = useState('0');
  const [feesMajor, setFeesMajor] = useState('0');
  const [notes, setNotes] = useState('');

  const { data: invoices = [] } = useQuery<Invoice[]>({
    queryKey: ['invoices', filter],
    queryFn: () => api.invoices.list(filter || undefined) as Promise<Invoice[]>
  });
  const { data: parties = [] } = useQuery<Party[]>({ queryKey: ['parties'], queryFn: () => api.parties.list() as Promise<Party[]> });
  const { data: items = [] } = useQuery<Item[]>({ queryKey: ['items'], queryFn: () => api.items.list() as Promise<Item[]> });
  const partyName = useNamesById(parties, p => p.name);
  const partyById = useIndexById(parties, p => Number(p.id));
  const itemById = useIndexById(items, i => Number(i.id));
  const itemByBarcode = useIndexById(items, i => i.barcode ?? `\u0000${i.id}`);
  const itemByCode = useIndexById(items, i => i.code);
  const { data: warehouses = [] } = useQuery<Warehouse[]>({ queryKey: ['warehouses'], queryFn: () => api.warehouses.list() as Promise<Warehouse[]> });
  const { data: cashboxes = [] } = useQuery<Cashbox[]>({ queryKey: ['cashboxes'], queryFn: () => api.cashboxes.list() as Promise<Cashbox[]> });

  const partyKindFilter: (p: Party) => boolean =
    kind === 'sale' || kind === 'sale_return'
      ? (p) => p.kind === 'customer' || p.kind === 'both'
      : (p) => p.kind === 'supplier' || p.kind === 'both';
  const filteredParties = parties.filter(partyKindFilter);

  const subtotalMinor = useMemo(() => {
    let s = 0n;
    for (const l of lines) {
      const qty = parseFloat(l.qty || '0');
      const unit = BigInt(majorToMinor(l.unitMajor));
      const disc = BigInt(majorToMinor(l.discountMajor));
      s += unit * BigInt(Math.round(qty * 100)) / 100n - disc;
    }
    return s;
  }, [lines]);
  const grandMinor = subtotalMinor - BigInt(majorToMinor(invDiscMajor)) + BigInt(majorToMinor(feesMajor));

  const reset = () => {
    setKind('sale'); setDate(today()); setPartyId(''); setWarehouseId(warehouses[0]?.id ?? '');
    setPaymentMode('cash'); setCashboxId(cashboxes[0]?.id ?? ''); setCurrency('USD');
    setLines([]); setInvDiscMajor('0'); setFeesMajor('0'); setNotes('');
  };

  const openNew = () => { reset(); setOpen(true); };

  const addLine = () => setLines([...lines, { itemId: items[0]?.id ?? 0, qty: '1', unitMajor: '0', discountMajor: '0' }]);
  const updLine = (i: number, patch: Partial<EditorLine>) => setLines(lines.map((l, idx) => idx === i ? { ...l, ...patch } : l));
  const rmLine = (i: number) => setLines(lines.filter((_, idx) => idx !== i));

  const onItemPick = (i: number, itemId: number) => {
    const it = itemById.get(itemId);
    if (!it) return updLine(i, { itemId });
    const def = kind === 'sale' || kind === 'sale_return' ? it.salePrices[0] : it.purchasePrices[0];
    updLine(i, { itemId, unitMajor: minorToMajor(def) });
  };

  // Barcode scanner: when modal open, scan a barcode → add (or increment) line for that item.
  useBarcodeScanner({
    onScan: (code) => {
      const it = itemByBarcode.get(code) ?? itemByCode.get(code);
      if (!it) {
        // eslint-disable-next-line no-alert
        alert(t('noItemForBarcode', { code }));
        return;
      }
      const def = kind === 'sale' || kind === 'sale_return' ? it.salePrices[0] : it.purchasePrices[0];
      setLines(prev => {
        const idx = prev.findIndex(l => l.itemId === it.id);
        if (idx >= 0) {
          const copy = [...prev];
          copy[idx] = { ...copy[idx], qty: String(parseFloat(copy[idx].qty || '0') + 1) };
          return copy;
        }
        return [...prev, { itemId: it.id, qty: '1', unitMajor: minorToMajor(def), discountMajor: '0' }];
      });
    }
  }, open);

  const exportList = (): void => {
    exportRows(`invoices-${filter || 'all'}`, invoices, [
      { header: t('reference'), value: r => r.serial },
      { header: t('date'), value: r => r.date },
      { header: tf('kind'), value: r => tf(KIND_KEYS[r.kind]) },
      { header: tf('party'), value: r => partyName(r.partyId) },
      { header: t('paymentMode'), value: r => r.paymentMode === 'cash' ? t('cash') : t('creditMode') },
      { header: t('currency'), value: r => r.currency },
      { header: t('subtotal'), value: r => minorToMajor(r.subtotalMinor) },
      { header: t('discount'), value: r => minorToMajor(r.invDiscountMinor) },
      { header: t('fees'), value: r => minorToMajor(r.feesMinor) },
      { header: t('grandTotal'), value: r => minorToMajor(r.grandTotalMinor) }
    ]);
  };

  const printOne = async (id: number): Promise<void> => {
    const inv = await api.invoices.get(id) as (Invoice & { lines: Array<{ itemCode: string; itemName: string; qty: string; unitPriceMinor: string; discountMinor: string; totalMinor: string }> }) | undefined;
    if (!inv) return;
    const party = partyById.get(inv.partyId);
    const lang = i18n.dir() === 'rtl' ? 'ar' : 'en';
    const kindLabel = tf(KIND_KEYS[inv.kind]);
    const head = `
      <div class="header">
        <div><h2>${escapeHtml(kindLabel)} — <span class="num">${escapeHtml(inv.serial)}</span></h2>
          <div class="meta">${escapeHtml(t('date'))}: <span class="num">${escapeHtml(inv.date)}</span></div>
          <div class="meta">${escapeHtml(tf('party'))}: ${escapeHtml(party?.name ?? '')}</div>
        </div>
      </div>`;
    const linesHtml = inv.lines.map((l, i) => `
      <tr>
        <td class="num">${i + 1}</td>
        <td>${escapeHtml(l.itemCode)} — ${escapeHtml(l.itemName)}</td>
        <td class="num">${escapeHtml(l.qty)}</td>
        <td class="num">${escapeHtml(formatMoney(l.unitPriceMinor, inv.currency))}</td>
        <td class="num">${escapeHtml(formatMoney(l.discountMinor, inv.currency))}</td>
        <td class="num">${escapeHtml(formatMoney(l.totalMinor, inv.currency))}</td>
      </tr>`).join('');
    const body = `
      ${head}
      <table>
        <thead><tr>
          <th>#</th><th>${escapeHtml(tf('item'))}</th>
          <th>${escapeHtml(t('qty'))}</th>
          <th>${escapeHtml(t('unitPrice'))}</th>
          <th>${escapeHtml(t('discount'))}</th>
          <th>${escapeHtml(t('total'))}</th>
        </tr></thead>
        <tbody>${linesHtml}</tbody>
      </table>
      <table class="totals">
        <tr><td class="label">${escapeHtml(t('subtotal'))}</td><td class="num">${escapeHtml(formatMoney(inv.subtotalMinor, inv.currency))}</td></tr>
        <tr><td class="label">${escapeHtml(t('discount'))}</td><td class="num">${escapeHtml(formatMoney(inv.invDiscountMinor, inv.currency))}</td></tr>
        <tr><td class="label">${escapeHtml(t('fees'))}</td><td class="num">${escapeHtml(formatMoney(inv.feesMinor, inv.currency))}</td></tr>
        <tr><td class="label"><b>${escapeHtml(t('grandTotal'))}</b></td><td class="num"><b>${escapeHtml(formatMoney(inv.grandTotalMinor, inv.currency))}</b></td></tr>
      </table>
      ${inv.notes ? `<p>${escapeHtml(tf('notes'))}: ${escapeHtml(inv.notes)}</p>` : ''}
      <div class="footer">${escapeHtml(t('noRibaNoTax'))}</div>
    `;
    printHtml(`${kindLabel} ${inv.serial}`, body, lang);
  };

  const save = async () => {
    if (!partyId || !warehouseId) { alert(t('partyAndWarehouseRequired')); return; }
    if (paymentMode === 'cash' && !cashboxId) { alert(t('cashboxRequiredForCash')); return; }
    if (lines.length === 0) { alert(t('atLeastOneLine')); return; }
    const payload = {
      kind, date, partyId: Number(partyId), warehouseId: Number(warehouseId),
      paymentMode, cashboxId: paymentMode === 'cash' ? Number(cashboxId) : null,
      currency,
      lines: lines.map(l => ({
        itemId: l.itemId,
        qty: l.qty,
        unitPriceMinor: majorToMinor(l.unitMajor),
        discountMinor: majorToMinor(l.discountMajor)
      })),
      invDiscountMinor: majorToMinor(invDiscMajor),
      feesMinor: majorToMinor(feesMajor),
      notes
    };
    const r = await api.invoices.save(payload) as { ok: boolean; error?: string };
    if (!r.ok) { alert(describeError(t, r)); return; }
    setOpen(false);
    void qc.invalidateQueries({ queryKey: ['invoices'] });
    void qc.invalidateQueries({ queryKey: ['dashboard'] });
  };

  return (
    <Page
      title={tn('invoices')}
      toolbar={
        <div className="flex gap-2">
          <Select value={filter} onChange={e => setFilter(e.target.value as InvoiceKind | '')}>
            <option value="">{t('allKinds')}</option>
            {INVOICE_KINDS.map(k => <option key={k} value={k}>{tf(KIND_KEYS[k])}</option>)}
          </Select>
          <Btn variant="ghost" onClick={exportList}>{t('exportCsv')}</Btn>
          <Btn onClick={openNew}>{t('new')}</Btn>
        </div>
      }
    >
      <Table<Invoice>
        rows={invoices}
        cols={[
          { key: 'serial', header: t('reference'), className: 'ltr-num w-32' },
          { key: 'date', header: t('date'), className: 'ltr-num w-28' },
          { key: 'kind', header: tf('kind'), render: r => tf(KIND_KEYS[r.kind]) },
          { key: 'partyId', header: tf('party'), render: r => partyName(r.partyId) },
          { key: 'paymentMode', header: t('paymentMode'), render: r => r.paymentMode === 'cash' ? t('cash') : t('creditMode') },
          { key: 'grandTotalMinor', header: t('grandTotal'), className: 'ltr-num text-end',
            render: r => formatMoney(r.grandTotalMinor, r.currency) },
          { key: 'id', header: '', className: 'w-24 text-center',
            render: r => <button className="text-accent text-xs hover:underline" onClick={() => printOne(r.id!)}>{t('print')}</button> }
        ]}
      />

      <Modal open={open} onClose={() => setOpen(false)} title={`${t('new')} — ${tf(KIND_KEYS[kind])}`} wide>
        <div className="grid grid-cols-4 gap-3">
          <div>
            <Label>{tf('kind')}</Label>
            <Select value={kind} onChange={e => setKind(e.target.value as InvoiceKind)}>
              {INVOICE_KINDS.map(k => <option key={k} value={k}>{tf(KIND_KEYS[k])}</option>)}
            </Select>
          </div>
          <div><Label>{t('date')}</Label><Input className="ltr-num" type="date" value={date} onChange={e => setDate(e.target.value)} /></div>
          <div>
            <Label>{tf('party')}</Label>
            <Select value={partyId} onChange={e => setPartyId(e.target.value ? Number(e.target.value) : '')}>
              <option value="">—</option>
              {filteredParties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </div>
          <div>
            <Label>{tf('warehouse')}</Label>
            <Select value={warehouseId} onChange={e => setWarehouseId(e.target.value ? Number(e.target.value) : '')}>
              <option value="">—</option>
              {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
            </Select>
          </div>
          <div>
            <Label>{t('paymentMode')}</Label>
            <Select value={paymentMode} onChange={e => setPaymentMode(e.target.value as PaymentMode)}>
              <option value="cash">{t('cash')}</option>
              <option value="credit">{t('creditMode')}</option>
            </Select>
          </div>
          {paymentMode === 'cash' && (
            <div>
              <Label>{tf('cashbox')}</Label>
              <Select value={cashboxId} onChange={e => setCashboxId(e.target.value ? Number(e.target.value) : '')}>
                <option value="">—</option>
                {cashboxes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </div>
          )}
          <div><Label>{t('currency')}</Label><Input value={currency} onChange={e => setCurrency(e.target.value)} /></div>
        </div>

        <div className="mt-4 flex items-center gap-2">
          <h3 className="text-sm font-semibold">{tn('items')}</h3>
          <Btn variant="ghost" onClick={addLine}>{tf('addLine')}</Btn>
        </div>
        <div className="mt-2 overflow-auto">
          <table className="w-full text-sm">
            <thead className="text-fg2 text-xs">
              <tr>
                <th className="text-start py-1">{tf('item')}</th>
                <th className="text-end ltr-num w-24">{t('qty')}</th>
                <th className="text-end ltr-num w-32">{t('unitPrice')}</th>
                <th className="text-end ltr-num w-32">{t('discount')}</th>
                <th className="text-end ltr-num w-32">{t('total')}</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => {
                const qty = parseFloat(l.qty || '0');
                const unit = BigInt(majorToMinor(l.unitMajor));
                const disc = BigInt(majorToMinor(l.discountMajor));
                const total = unit * BigInt(Math.round(qty * 100)) / 100n - disc;
                return (
                  <tr key={i} className="border-t border-line">
                    <td className="py-1.5">
                      <Select className="w-full" value={l.itemId} onChange={e => onItemPick(i, Number(e.target.value))}>
                        {items.map(it => <option key={it.id} value={it.id}>{it.code} · {it.name}</option>)}
                      </Select>
                    </td>
                    <td><Input className="ltr-num text-end w-full" value={l.qty} onChange={e => updLine(i, { qty: e.target.value })} /></td>
                    <td><Input className="ltr-num text-end w-full" value={l.unitMajor} onChange={e => updLine(i, { unitMajor: e.target.value })} /></td>
                    <td><Input className="ltr-num text-end w-full" value={l.discountMajor} onChange={e => updLine(i, { discountMajor: e.target.value })} /></td>
                    <td className="text-end ltr-num">{formatMoney(total.toString(), currency)}</td>
                    <td className="text-end"><button className="text-rose-400 text-xs" onClick={() => rmLine(i)}>×</button></td>
                  </tr>
                );
              })}
              {lines.length === 0 && (
                <tr><td colSpan={6} className="text-center text-fg2 py-4">{t('noData')}</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="grid grid-cols-3 gap-3 mt-4">
          <div><Label>{t('discount')}</Label><Input className="ltr-num" value={invDiscMajor} onChange={e => setInvDiscMajor(e.target.value)} /></div>
          <div><Label>{t('fees')} ({t('noTax')})</Label><Input className="ltr-num" value={feesMajor} onChange={e => setFeesMajor(e.target.value)} /></div>
          <div><Label>{t('grandTotal')}</Label><div className="text-lg font-semibold ltr-num pt-1">{formatMoney(grandMinor.toString(), currency)}</div></div>
        </div>
        <div className="mt-3"><Label>{tf('notes')}</Label><Input value={notes} onChange={e => setNotes(e.target.value)} /></div>

        <div className="flex justify-end gap-2 mt-4">
          <Btn variant="ghost" onClick={() => setOpen(false)}>{t('cancel')}</Btn>
          <Btn onClick={save}>{tf('post')}</Btn>
        </div>
      </Modal>
    </Page>
  );
}
