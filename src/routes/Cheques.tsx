import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { api } from '../lib/ipc';
import type { Cashbox, Cheque, ChequeStatus, Party } from '@shared/types';
import { Btn, Input, Label, Modal, Page, Select, Table } from '../components/ui';
import { formatMoney, majorToMinor, today } from '../lib/money';
import { useNamesById } from '../lib/lookup';

export default function ChequesPage(): JSX.Element {
  const { t } = useTranslation();
  const tf = useTranslation('forms').t;
  const tn = useTranslation('nav').t;
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Partial<Cheque>>({
    direction: 'in', date: today(), dueDate: today(), currency: 'USD', amountMinor: '0'
  });
  const [amountMajor, setAmountMajor] = useState('0');

  const { data: cheques = [] } = useQuery<Cheque[]>({ queryKey: ['cheques'], queryFn: () => api.cheques.list() as Promise<Cheque[]> });
  const { data: parties = [] } = useQuery<Party[]>({ queryKey: ['parties'], queryFn: () => api.parties.list() as Promise<Party[]> });
  const partyName = useNamesById(parties, p => p.name);
  const { data: cashboxes = [] } = useQuery<Cashbox[]>({ queryKey: ['cashboxes'], queryFn: () => api.cashboxes.list() as Promise<Cashbox[]> });
  const { data: banks = [] } = useQuery<Array<{ id: number; name: string; branch: string | null }>>({ queryKey: ['banks'], queryFn: () => api.banks.list() as Promise<Array<{ id: number; name: string; branch: string | null }>> });

  const save = async () => {
    if (!editing.partyId || !editing.number) { alert('Party + number required'); return; }
    const r = await api.cheques.save({
      ...editing,
      amountMinor: majorToMinor(amountMajor)
    }) as { ok: boolean; error?: string };
    if (!r.ok) { alert(r.error || t('error')); return; }
    setOpen(false); setEditing({ direction: 'in', date: today(), dueDate: today(), currency: 'USD' }); setAmountMajor('0');
    void qc.invalidateQueries({ queryKey: ['cheques'] });
  };

  const transition = async (c: Cheque, to: ChequeStatus) => {
    const r = await api.cheques.transition({ id: c.id!, toStatus: to, date: today() }) as { ok: boolean; error?: string };
    if (!r.ok) alert(r.error || t('error'));
    else void qc.invalidateQueries({ queryKey: ['cheques'] });
  };

  const incomingTransitions: ChequeStatus[] = ['cleared', 'returned'];
  const outgoingTransitions: ChequeStatus[] = ['paid', 'cancelled'];

  return (
    <Page title={tn('cheques')} toolbar={<Btn onClick={() => setOpen(true)}>{t('new')}</Btn>}>
      <Table<Cheque>
        rows={cheques}
        cols={[
          { key: 'serial', header: t('reference'), className: 'ltr-num w-32' },
          { key: 'number', header: tf('chequeNumber'), className: 'ltr-num w-28' },
          { key: 'direction', header: tf('direction'), render: r => r.direction === 'in' ? tf('in') : tf('out') },
          { key: 'partyId', header: tf('party'), render: r => partyName(r.partyId) },
          { key: 'dueDate', header: tf('dueDate'), className: 'ltr-num w-28' },
          { key: 'amountMinor', header: t('amount'), className: 'ltr-num text-end',
            render: r => formatMoney(r.amountMinor, r.currency) },
          { key: 'status', header: tf('status'), render: r => tf(r.status) },
          { key: 'actions', header: t('actions'), className: 'text-end',
            render: r => {
              const opts = r.direction === 'in' ? incomingTransitions : outgoingTransitions;
              return (
                <div className="flex justify-end gap-1">
                  {opts.map(s => (
                    <Btn key={s} variant="ghost" onClick={() => transition(r, s)}>{tf(s)}</Btn>
                  ))}
                </div>
              );
            }
          }
        ]}
      />
      <Modal open={open} onClose={() => setOpen(false)} title={t('new')}>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>{tf('direction')}</Label>
            <Select value={editing.direction} onChange={e => setEditing({ ...editing, direction: e.target.value as 'in'|'out' })}>
              <option value="in">{tf('in')}</option>
              <option value="out">{tf('out')}</option>
            </Select>
          </div>
          <div><Label>{tf('chequeNumber')}</Label><Input className="ltr-num" value={editing.number ?? ''} onChange={e => setEditing({ ...editing, number: e.target.value })} /></div>
          <div><Label>{tf('bank')}</Label>
            <Input list="bank-options" value={editing.bank ?? ''} onChange={e => setEditing({ ...editing, bank: e.target.value })} />
            <datalist id="bank-options">
              {banks.map(b => <option key={b.id} value={b.branch ? `${b.name} — ${b.branch}` : b.name} />)}
            </datalist>
          </div>
          <div><Label>{t('date')}</Label><Input className="ltr-num" type="date" value={editing.date ?? today()} onChange={e => setEditing({ ...editing, date: e.target.value })} /></div>
          <div><Label>{tf('dueDate')}</Label><Input className="ltr-num" type="date" value={editing.dueDate ?? today()} onChange={e => setEditing({ ...editing, dueDate: e.target.value })} /></div>
          <div>
            <Label>{tf('party')}</Label>
            <Select value={editing.partyId ?? ''} onChange={e => setEditing({ ...editing, partyId: Number(e.target.value) })}>
              <option value="">—</option>
              {parties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </div>
          <div>
            <Label>{tf('cashbox')}</Label>
            <Select value={editing.cashboxId ?? ''} onChange={e => setEditing({ ...editing, cashboxId: e.target.value ? Number(e.target.value) : null })}>
              <option value="">—</option>
              {cashboxes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </div>
          <div><Label>{t('currency')}</Label><Input value={editing.currency ?? 'USD'} onChange={e => setEditing({ ...editing, currency: e.target.value })} /></div>
          <div><Label>{t('amount')}</Label><Input className="ltr-num" value={amountMajor} onChange={e => setAmountMajor(e.target.value)} /></div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <Btn variant="ghost" onClick={() => setOpen(false)}>{t('cancel')}</Btn>
          <Btn onClick={save}>{t('save')}</Btn>
        </div>
      </Modal>
    </Page>
  );
}
