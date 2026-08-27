import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { api } from '../lib/ipc';
import type { Cashbox, Party, Voucher, VoucherKind } from '@shared/types';
import { Btn, Input, Label, Modal, Page, Select, Table } from '../components/ui';
import { formatMoney, majorToMinor, today } from '../lib/money';

export default function VouchersPage(): JSX.Element {
  const { t } = useTranslation();
  const tf = useTranslation('forms').t;
  const tn = useTranslation('nav').t;
  const qc = useQueryClient();

  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<VoucherKind>('receipt');
  const [date, setDate] = useState(today());
  const [partyId, setPartyId] = useState<number | ''>('');
  const [cashboxId, setCashboxId] = useState<number | ''>('');
  const [currency, setCurrency] = useState('USD');
  const [amountMajor, setAmountMajor] = useState('0');
  const [notes, setNotes] = useState('');

  const { data: vouchers = [] } = useQuery<Voucher[]>({ queryKey: ['vouchers'], queryFn: () => api.vouchers.list() as Promise<Voucher[]> });
  const { data: parties = [] } = useQuery<Party[]>({ queryKey: ['parties'], queryFn: () => api.parties.list() as Promise<Party[]> });
  const { data: cashboxes = [] } = useQuery<Cashbox[]>({ queryKey: ['cashboxes'], queryFn: () => api.cashboxes.list() as Promise<Cashbox[]> });

  const filteredParties = parties.filter(p => kind === 'receipt'
    ? (p.kind === 'customer' || p.kind === 'both')
    : (p.kind === 'supplier' || p.kind === 'both' || p.kind === 'employee'));

  const save = async () => {
    if (!partyId || !cashboxId) { alert('Party + cashbox required'); return; }
    const r = await api.vouchers.save({
      kind, date, partyId: Number(partyId), cashboxId: Number(cashboxId), currency,
      amountMinor: majorToMinor(amountMajor), notes
    }) as { ok: boolean; error?: string };
    if (!r.ok) { alert(r.error || t('error')); return; }
    setOpen(false);
    void qc.invalidateQueries({ queryKey: ['vouchers'] });
  };

  return (
    <Page title={tn('vouchers')} toolbar={<Btn onClick={() => { setOpen(true); }}>{t('new')}</Btn>}>
      <Table<Voucher>
        rows={vouchers}
        cols={[
          { key: 'serial', header: t('reference'), className: 'ltr-num w-32' },
          { key: 'date', header: t('date'), className: 'ltr-num w-28' },
          { key: 'kind', header: tf('kind'), render: r => r.kind === 'receipt' ? tf('receipt') : tf('payment') },
          { key: 'partyId', header: tf('party'), render: r => parties.find(p => p.id === r.partyId)?.name ?? '' },
          { key: 'amountMinor', header: t('amount'), className: 'text-end ltr-num',
            render: r => formatMoney(r.amountMinor, r.currency) }
        ]}
      />
      <Modal open={open} onClose={() => setOpen(false)} title={t('new')}>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>{tf('kind')}</Label>
            <Select value={kind} onChange={e => setKind(e.target.value as VoucherKind)}>
              <option value="receipt">{tf('receipt')}</option>
              <option value="payment">{tf('payment')}</option>
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
            <Label>{tf('cashbox')}</Label>
            <Select value={cashboxId} onChange={e => setCashboxId(e.target.value ? Number(e.target.value) : '')}>
              <option value="">—</option>
              {cashboxes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </div>
          <div><Label>{t('currency')}</Label><Input value={currency} onChange={e => setCurrency(e.target.value)} /></div>
          <div><Label>{t('amount')}</Label><Input className="ltr-num" value={amountMajor} onChange={e => setAmountMajor(e.target.value)} /></div>
          <div className="col-span-2"><Label>{tf('notes')}</Label><Input value={notes} onChange={e => setNotes(e.target.value)} /></div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <Btn variant="ghost" onClick={() => setOpen(false)}>{t('cancel')}</Btn>
          <Btn onClick={save}>{tf('post')}</Btn>
        </div>
      </Modal>
    </Page>
  );
}
