import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { api } from '../lib/ipc';
import type { Account, Cashbox } from '@shared/types';
import { Btn, Input, Label, Modal, Page, Select, Table } from '../components/ui';
import { formatMoney, majorToMinor, today } from '../lib/money';

interface Employee { id: number; code: string; name: string; basicSalaryMinor: string; allowanceMinor: string; payableAccountId: number | null }
interface Sheet {
  id: number; serial: string; period: string; date: string; currency: string;
  totalMinor: string; paidMinor: string; status: string; notes: string | null;
}
interface Line {
  employeeId: number; basicMajor: string; allowMajor: string; otMajor: string; dedMajor: string; paidMajor: string;
}

export default function PayrollPage(): JSX.Element {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [period, setPeriod] = useState(today().slice(0, 7));
  const [date, setDate] = useState(today());
  const [currency, setCurrency] = useState('USD');
  const [salaryAccountId, setSalaryAccountId] = useState<number | ''>('');
  const [payableAccountId, setPayableAccountId] = useState<number | ''>('');
  const [paymentCashboxId, setPaymentCashboxId] = useState<number | ''>('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<Line[]>([]);

  const { data = [] } = useQuery<Sheet[]>({ queryKey: ['payroll'], queryFn: () => api.payroll.list() as Promise<Sheet[]> });
  const { data: employees = [] } = useQuery<Employee[]>({ queryKey: ['employees'], queryFn: () => api.employees.list() as Promise<Employee[]> });
  const { data: accounts = [] } = useQuery<Account[]>({ queryKey: ['accounts'], queryFn: () => api.accounts.list() as Promise<Account[]> });
  const { data: cashboxes = [] } = useQuery<Cashbox[]>({ queryKey: ['cashboxes'], queryFn: () => api.cashboxes.list() as Promise<Cashbox[]> });
  const expAccts = accounts.filter(a => a.type === 'expense');
  const liabAccts = accounts.filter(a => a.type === 'liability');

  const reset = (): void => {
    setPeriod(today().slice(0, 7)); setDate(today()); setCurrency('USD');
    setSalaryAccountId(expAccts.find(a => a.code === '5230')?.id ?? '');
    setPayableAccountId(liabAccts.find(a => a.code === '2120')?.id ?? '');
    setPaymentCashboxId(''); setNotes('');
    setLines(employees.filter(e => true).map(e => ({
      employeeId: e.id,
      basicMajor: (Number(e.basicSalaryMinor) / 100).toString(),
      allowMajor: (Number(e.allowanceMinor) / 100).toString(),
      otMajor: '0', dedMajor: '0', paidMajor: '0'
    })));
  };

  const save = async (): Promise<void> => {
    if (!salaryAccountId || !payableAccountId || lines.length === 0) { alert('Required fields missing'); return; }
    const cashbox = cashboxes.find(c => c.id === Number(paymentCashboxId));
    const r = await api.payroll.save({
      period, date, currency,
      salaryAccountId: Number(salaryAccountId), payableAccountId: Number(payableAccountId),
      paymentAccountId: cashbox ? cashbox.accountId : null,
      notes,
      lines: lines.map(l => ({
        employeeId: l.employeeId,
        basicMinor: majorToMinor(l.basicMajor),
        allowanceMinor: majorToMinor(l.allowMajor),
        overtimeMinor: majorToMinor(l.otMajor),
        deductionsMinor: majorToMinor(l.dedMajor),
        paidMinor: majorToMinor(l.paidMajor)
      }))
    }) as { ok: boolean; error?: string };
    if (!r.ok) { alert(r.error ?? t('error')); return; }
    setOpen(false); reset();
    void qc.invalidateQueries({ queryKey: ['payroll'] });
  };

  const empName = (id: number): string => employees.find(e => e.id === id)?.name ?? `#${id}`;

  return (
    <Page title={t('payroll')} toolbar={<Btn onClick={() => { reset(); setOpen(true); }}>{t('new')}</Btn>}>
      <Table<Sheet>
        rows={data}
        cols={[
          { key: 'serial', header: t('reference'), className: 'w-32 ltr-num' },
          { key: 'period', header: 'Period', className: 'w-28 ltr-num' },
          { key: 'date', header: t('date'), className: 'w-28 ltr-num' },
          { key: 'totalMinor', header: t('total'), className: 'ltr-num text-end',
            render: r => formatMoney(r.totalMinor, r.currency) },
          { key: 'paidMinor', header: 'Paid', className: 'ltr-num text-end',
            render: r => formatMoney(r.paidMinor, r.currency) },
          { key: 'status', header: t('status'), render: r => t(r.status) }
        ]}
      />
      <Modal open={open} onClose={() => setOpen(false)} title={t('new')} wide>
        <div className="grid grid-cols-4 gap-3">
          <div><Label>Period</Label><Input className="ltr-num" value={period} onChange={e => setPeriod(e.target.value)} /></div>
          <div><Label>{t('date')}</Label><Input type="date" className="ltr-num" value={date} onChange={e => setDate(e.target.value)} /></div>
          <div><Label>{t('currency')}</Label><Input value={currency} onChange={e => setCurrency(e.target.value)} /></div>
          <div />
          <div><Label>Salary expense</Label>
            <Select value={salaryAccountId} onChange={e => setSalaryAccountId(e.target.value ? Number(e.target.value) : '')}>
              <option value="">—</option>{expAccts.map(a => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
            </Select>
          </div>
          <div><Label>Salary payable</Label>
            <Select value={payableAccountId} onChange={e => setPayableAccountId(e.target.value ? Number(e.target.value) : '')}>
              <option value="">—</option>{liabAccts.map(a => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
            </Select>
          </div>
          <div className="col-span-2"><Label>Pay from cashbox (optional)</Label>
            <Select value={paymentCashboxId} onChange={e => setPaymentCashboxId(e.target.value ? Number(e.target.value) : '')}>
              <option value="">—</option>{cashboxes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </div>
        </div>
        <table className="w-full text-sm mt-4">
          <thead className="text-fg2 text-xs"><tr>
            <th className="text-start py-1">Employee</th>
            <th className="text-end ltr-num w-28">Basic</th>
            <th className="text-end ltr-num w-28">Allowance</th>
            <th className="text-end ltr-num w-28">Overtime</th>
            <th className="text-end ltr-num w-28">Deductions</th>
            <th className="text-end ltr-num w-28">Paid</th>
          </tr></thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={i} className="border-t border-line">
                <td className="py-1.5">{empName(l.employeeId)}</td>
                <td><Input className="ltr-num text-end w-full" value={l.basicMajor} onChange={e => setLines(lines.map((x, idx) => idx === i ? { ...x, basicMajor: e.target.value } : x))} /></td>
                <td><Input className="ltr-num text-end w-full" value={l.allowMajor} onChange={e => setLines(lines.map((x, idx) => idx === i ? { ...x, allowMajor: e.target.value } : x))} /></td>
                <td><Input className="ltr-num text-end w-full" value={l.otMajor} onChange={e => setLines(lines.map((x, idx) => idx === i ? { ...x, otMajor: e.target.value } : x))} /></td>
                <td><Input className="ltr-num text-end w-full" value={l.dedMajor} onChange={e => setLines(lines.map((x, idx) => idx === i ? { ...x, dedMajor: e.target.value } : x))} /></td>
                <td><Input className="ltr-num text-end w-full" value={l.paidMajor} onChange={e => setLines(lines.map((x, idx) => idx === i ? { ...x, paidMajor: e.target.value } : x))} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-3"><Label>{t('notes')}</Label><Input value={notes} onChange={e => setNotes(e.target.value)} /></div>
        <div className="flex justify-end gap-2 mt-4">
          <Btn variant="ghost" onClick={() => setOpen(false)}>{t('cancel')}</Btn>
          <Btn onClick={save}>{t('save')}</Btn>
        </div>
      </Modal>
    </Page>
  );
}
