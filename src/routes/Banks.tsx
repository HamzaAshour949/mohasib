import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { api } from '../lib/ipc';
import { Btn, Input, Label, Modal, Page, Table } from '../components/ui';

interface Bank {
  id: number; code: string; name: string; nameEn: string | null;
  branch: string | null; address: string | null; phone: string | null;
  accountNo: string | null; notes: string | null; isActive: 0 | 1;
}

export default function BanksPage(): JSX.Element {
  const { t } = useTranslation();
  const tn = useTranslation('nav').t;
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Partial<Bank>>({});

  const { data = [] } = useQuery<Bank[]>({ queryKey: ['banks'], queryFn: () => api.banks.list() as Promise<Bank[]> });

  const save = async (): Promise<void> => {
    const r = await api.banks.save(editing) as { ok: boolean; error?: string };
    if (!r.ok) { alert(r.error ?? t('error')); return; }
    setOpen(false); setEditing({});
    void qc.invalidateQueries({ queryKey: ['banks'] });
  };
  const remove = async (id: number): Promise<void> => {
    if (!confirm(t('confirmDelete'))) return;
    await api.banks.delete(id);
    void qc.invalidateQueries({ queryKey: ['banks'] });
  };

  return (
    <Page title={tn('banks')} toolbar={<Btn onClick={() => { setEditing({ isActive: 1 }); setOpen(true); }}>{t('add')}</Btn>}>
      <Table<Bank>
        rows={data}
        cols={[
          { key: 'code', header: t('code'), className: 'w-24 ltr-num' },
          { key: 'name', header: t('name') },
          { key: 'branch', header: t('branch') },
          { key: 'phone', header: t('phone'), className: 'ltr-num' },
          { key: 'accountNo', header: t('accountNo'), className: 'ltr-num' },
          { key: 'isActive', header: t('active'), render: r => r.isActive ? '✓' : '' },
          { key: 'actions', header: t('actions'), className: 'w-48 text-end',
            render: r => <>
              <Btn variant="ghost" onClick={() => { setEditing(r); setOpen(true); }}>{t('edit')}</Btn>{' '}
              <Btn variant="danger" onClick={() => remove(r.id)}>{t('delete')}</Btn>
            </> }
        ]}
      />
      <Modal open={open} onClose={() => setOpen(false)} title={editing.id ? t('edit') : t('add')}>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>{t('code')}</Label><Input value={editing.code ?? ''} onChange={e => setEditing({ ...editing, code: e.target.value })} /></div>
          <div><Label>{t('branch')}</Label><Input value={editing.branch ?? ''} onChange={e => setEditing({ ...editing, branch: e.target.value })} /></div>
          <div className="col-span-2"><Label>{t('name')}</Label><Input value={editing.name ?? ''} onChange={e => setEditing({ ...editing, name: e.target.value })} /></div>
          <div className="col-span-2"><Label>Name (EN)</Label><Input value={editing.nameEn ?? ''} onChange={e => setEditing({ ...editing, nameEn: e.target.value })} /></div>
          <div><Label>{t('phone')}</Label><Input className="ltr-num" value={editing.phone ?? ''} onChange={e => setEditing({ ...editing, phone: e.target.value })} /></div>
          <div><Label>{t('accountNo')}</Label><Input className="ltr-num" value={editing.accountNo ?? ''} onChange={e => setEditing({ ...editing, accountNo: e.target.value })} /></div>
          <div className="col-span-2"><Label>{t('address')}</Label><Input value={editing.address ?? ''} onChange={e => setEditing({ ...editing, address: e.target.value })} /></div>
          <div className="col-span-2"><Label>{t('notes')}</Label><Input value={editing.notes ?? ''} onChange={e => setEditing({ ...editing, notes: e.target.value })} /></div>
          <div><Label>{t('active')}</Label>
            <select value={editing.isActive ?? 1} onChange={e => setEditing({ ...editing, isActive: Number(e.target.value) as 0 | 1 })}
              className="bg-bg2 border border-line rounded-md px-2 py-1.5 text-sm w-full">
              <option value={1}>{t('yes')}</option><option value={0}>{t('no')}</option>
            </select>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <Btn variant="ghost" onClick={() => setOpen(false)}>{t('cancel')}</Btn>
          <Btn onClick={save}>{t('save')}</Btn>
        </div>
      </Modal>
    </Page>
  );
}
