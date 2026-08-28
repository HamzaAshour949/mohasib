import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { api } from '../lib/ipc';
import type { Account } from '@shared/types';
import { Btn, Input, Label, Modal, Page, Table } from '../components/ui';
import { formatMoney, majorToMinor, minorToMajor } from '../lib/money';
import { describeError } from '../lib/errors';
import { useBaseCurrency } from '../lib/settings';

interface Employee {
  id: number; code: string; name: string; nameEn: string | null;
  hireDate: string | null; jobTitle: string | null;
  basicSalaryMinor: string; allowanceMinor: string;
  payableAccountId: number | null; phone: string | null; email: string | null;
  notes: string | null; isActive: number;
}

export default function EmployeesPage(): JSX.Element {
  const baseCurrency = useBaseCurrency();
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Partial<Employee> & { basicSalaryMajor?: string; allowanceMajor?: string }>({});

  const { data = [] } = useQuery<Employee[]>({ queryKey: ['employees'], queryFn: () => api.employees.list() as Promise<Employee[]> });
  const { data: accounts = [] } = useQuery<Account[]>({ queryKey: ['accounts'], queryFn: () => api.accounts.list() as Promise<Account[]> });
  const liabAccts = accounts.filter(a => a.type === 'liability');

  const startEdit = (e?: Employee): void => {
    if (e) setEditing({ ...e, basicSalaryMajor: minorToMajor(e.basicSalaryMinor), allowanceMajor: minorToMajor(e.allowanceMinor) });
    else setEditing({ isActive: 1, basicSalaryMajor: '0', allowanceMajor: '0' });
    setOpen(true);
  };

  const save = async (): Promise<void> => {
    const payload = { ...editing,
      basicSalaryMinor: majorToMinor(editing.basicSalaryMajor ?? '0'),
      allowanceMinor: majorToMinor(editing.allowanceMajor ?? '0')
    };
    const r = await api.employees.save(payload) as { ok: boolean; error?: string };
    if (!r.ok) { alert(describeError(t, r)); return; }
    setOpen(false); setEditing({});
    void qc.invalidateQueries({ queryKey: ['employees'] });
  };
  const remove = async (id: number): Promise<void> => {
    if (!confirm(t('confirmDelete'))) return;
    const r = await api.employees.delete(id) as { ok: boolean; error?: string };
    if (!r.ok) { alert(describeError(t, r)); return; }
    void qc.invalidateQueries({ queryKey: ['employees'] });
  };

  return (
    <Page title={t('employees')} toolbar={<Btn onClick={() => startEdit()}>{t('add')}</Btn>}>
      <Table<Employee>
        rows={data}
        cols={[
          { key: 'code', header: t('code'), className: 'w-24 ltr-num' },
          { key: 'name', header: t('name') },
          { key: 'jobTitle', header: 'Job' },
          { key: 'basicSalaryMinor', header: 'Basic salary', className: 'ltr-num text-end',
            render: r => formatMoney(r.basicSalaryMinor, baseCurrency) },
          { key: 'isActive', header: t('active'), className: 'w-20', render: r => r.isActive ? '✓' : '—' },
          { key: 'actions', header: t('actions'), className: 'w-48 text-end',
            render: r => <>
              <Btn variant="ghost" onClick={() => startEdit(r)}>{t('edit')}</Btn>{' '}
              <Btn variant="danger" onClick={() => remove(r.id)}>{t('delete')}</Btn>
            </> }
        ]}
      />
      <Modal open={open} onClose={() => setOpen(false)} title={editing.id ? t('edit') : t('add')} wide>
        <div className="grid grid-cols-3 gap-3">
          <div><Label>{t('code')}</Label><Input value={editing.code ?? ''} onChange={e => setEditing({ ...editing, code: e.target.value })} /></div>
          <div className="col-span-2"><Label>{t('name')}</Label><Input value={editing.name ?? ''} onChange={e => setEditing({ ...editing, name: e.target.value })} /></div>
          <div><Label>Job title</Label><Input value={editing.jobTitle ?? ''} onChange={e => setEditing({ ...editing, jobTitle: e.target.value })} /></div>
          <div><Label>Hire date</Label><Input type="date" className="ltr-num" value={editing.hireDate ?? ''} onChange={e => setEditing({ ...editing, hireDate: e.target.value })} /></div>
          <div><Label>{t('active')}</Label>
            <select value={editing.isActive ?? 1} onChange={e => setEditing({ ...editing, isActive: Number(e.target.value) })}
              className="bg-bg2 border border-line rounded-md px-2 py-1.5 text-sm w-full">
              <option value={1}>{t('yes')}</option><option value={0}>{t('no')}</option>
            </select>
          </div>
          <div><Label>Basic salary</Label><Input className="ltr-num text-end" value={editing.basicSalaryMajor ?? '0'} onChange={e => setEditing({ ...editing, basicSalaryMajor: e.target.value })} /></div>
          <div><Label>Allowance</Label><Input className="ltr-num text-end" value={editing.allowanceMajor ?? '0'} onChange={e => setEditing({ ...editing, allowanceMajor: e.target.value })} /></div>
          <div><Label>Payable account</Label>
            <select value={editing.payableAccountId ?? ''} onChange={e => setEditing({ ...editing, payableAccountId: e.target.value ? Number(e.target.value) : null })}
              className="bg-bg2 border border-line rounded-md px-2 py-1.5 text-sm w-full">
              <option value="">—</option>
              {liabAccts.map(a => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
            </select>
          </div>
          <div><Label>Phone</Label><Input value={editing.phone ?? ''} onChange={e => setEditing({ ...editing, phone: e.target.value })} /></div>
          <div className="col-span-2"><Label>Email</Label><Input value={editing.email ?? ''} onChange={e => setEditing({ ...editing, email: e.target.value })} /></div>
          <div className="col-span-3"><Label>{t('notes')}</Label><Input value={editing.notes ?? ''} onChange={e => setEditing({ ...editing, notes: e.target.value })} /></div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <Btn variant="ghost" onClick={() => setOpen(false)}>{t('cancel')}</Btn>
          <Btn onClick={save}>{t('save')}</Btn>
        </div>
      </Modal>
    </Page>
  );
}
