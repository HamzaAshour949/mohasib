import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { api } from '../lib/ipc';
import type { Party } from '@shared/types';
import { Btn, Input, Label, Modal, Page, Select, Table } from '../components/ui';
import { formatMoney, majorToMinor, today } from '../lib/money';
import { describeError } from '../lib/errors';

type NoteKind = 'debit_customer' | 'credit_customer' | 'debit_supplier' | 'credit_supplier';

interface NoteRow {
  id: number; kind: NoteKind; serial: string; date: string;
  partyId: number; partyName: string; accountId: number; accountCode: string;
  currency: string; amountMinor: string; notes: string | null; journalId: number | null;
}
interface AcctRow { id: number; code: string; name: string; type: string; isLeaf: 0 | 1 }

export default function NotesPage(): JSX.Element {
  const { t } = useTranslation();
  const tn = useTranslation('nav').t;
  const qc = useQueryClient();

  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<NoteKind>('debit_customer');
  const [date, setDate] = useState(today());
  const [partyId, setPartyId] = useState<number | ''>('');
  const [accountId, setAccountId] = useState<number | ''>('');
  const [currency, setCurrency] = useState('USD');
  const [amountMajor, setAmountMajor] = useState('0');
  const [notes, setNotes] = useState('');

  const { data = [] } = useQuery<NoteRow[]>({ queryKey: ['notes'], queryFn: () => api.notes.list() as Promise<NoteRow[]> });
  const { data: parties = [] } = useQuery<Party[]>({ queryKey: ['parties'], queryFn: () => api.parties.list() as Promise<Party[]> });
  const { data: accounts = [] } = useQuery<AcctRow[]>({ queryKey: ['accounts'], queryFn: () => api.accounts.list() as Promise<AcctRow[]> });

  const isCustomer = kind === 'debit_customer' || kind === 'credit_customer';
  const filteredParties = parties.filter(p => isCustomer
    ? (p.kind === 'customer' || p.kind === 'both')
    : (p.kind === 'supplier' || p.kind === 'both'));
  const leafAccounts = accounts.filter(a => a.isLeaf === 1);

  const reset = (): void => {
    setKind('debit_customer'); setDate(today()); setPartyId(''); setAccountId('');
    setCurrency('USD'); setAmountMajor('0'); setNotes('');
  };

  const save = async (): Promise<void> => {
    if (!partyId || !accountId) { alert(t('partyAndOffsetAccountRequired')); return; }
    const r = await api.notes.save({
      kind, date, partyId: Number(partyId), accountId: Number(accountId),
      currency, amountMinor: majorToMinor(amountMajor), notes
    }) as { ok: boolean; error?: string };
    if (!r.ok) { alert(describeError(t, r)); return; }
    setOpen(false); reset();
    void qc.invalidateQueries({ queryKey: ['notes'] });
  };

  const kindLabel = (k: NoteKind): string => t(k);

  return (
    <Page title={tn('notes')} toolbar={<Btn onClick={() => { reset(); setOpen(true); }}>{t('new')}</Btn>}>
      <Table<NoteRow>
        rows={data}
        cols={[
          { key: 'serial', header: t('reference'), className: 'ltr-num w-32' },
          { key: 'date', header: t('date'), className: 'ltr-num w-28' },
          { key: 'kind', header: t('type'), render: r => kindLabel(r.kind) },
          { key: 'partyName', header: t('party') },
          { key: 'accountCode', header: t('account'), className: 'ltr-num' },
          { key: 'amountMinor', header: t('amount'), className: 'text-end ltr-num',
            render: r => formatMoney(r.amountMinor, r.currency) }
        ]}
      />
      <Modal open={open} onClose={() => setOpen(false)} title={t('new')}>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>{t('type')}</Label>
            <Select value={kind} onChange={e => { setKind(e.target.value as NoteKind); setPartyId(''); }}>
              <option value="debit_customer">{t('debit_customer')}</option>
              <option value="credit_customer">{t('credit_customer')}</option>
              <option value="debit_supplier">{t('debit_supplier')}</option>
              <option value="credit_supplier">{t('credit_supplier')}</option>
            </Select>
          </div>
          <div><Label>{t('date')}</Label><Input type="date" className="ltr-num" value={date} onChange={e => setDate(e.target.value)} /></div>
          <div><Label>{t('party')}</Label>
            <Select value={partyId} onChange={e => setPartyId(e.target.value ? Number(e.target.value) : '')}>
              <option value="">—</option>
              {filteredParties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </div>
          <div><Label>{t('account')}</Label>
            <Select value={accountId} onChange={e => setAccountId(e.target.value ? Number(e.target.value) : '')}>
              <option value="">—</option>
              {leafAccounts.map(a => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
            </Select>
          </div>
          <div><Label>{t('currency')}</Label><Input value={currency} onChange={e => setCurrency(e.target.value)} /></div>
          <div><Label>{t('amount')}</Label><Input className="ltr-num" value={amountMajor} onChange={e => setAmountMajor(e.target.value)} /></div>
          <div className="col-span-2"><Label>{t('notes')}</Label><Input value={notes} onChange={e => setNotes(e.target.value)} /></div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <Btn variant="ghost" onClick={() => setOpen(false)}>{t('cancel')}</Btn>
          <Btn onClick={save}>{t('save')}</Btn>
        </div>
      </Modal>
    </Page>
  );
}
