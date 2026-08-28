import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { api } from '../lib/ipc';
import { Btn, Input, Label, Modal, Page, Table } from '../components/ui';
import { describeError } from '../lib/errors';

interface Dept { id: number; code: string; name: string; nameEn: string | null; isActive: number }

export default function DepartmentsPage(): JSX.Element {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Partial<Dept>>({});

  const { data = [] } = useQuery<Dept[]>({ queryKey: ['departments'], queryFn: () => api.departments.list() as Promise<Dept[]> });

  const save = async (): Promise<void> => {
    const r = await api.departments.save(editing) as { ok: boolean; error?: string };
    if (!r.ok) { alert(describeError(t, r)); return; }
    setOpen(false); setEditing({});
    void qc.invalidateQueries({ queryKey: ['departments'] });
  };
  const remove = async (id: number): Promise<void> => {
    if (!confirm(t('confirmDelete'))) return;
    const r = await api.departments.delete(id) as { ok: boolean; error?: string };
    if (!r.ok) { alert(describeError(t, r)); return; }
    void qc.invalidateQueries({ queryKey: ['departments'] });
  };

  return (
    <Page title={t('departments')} toolbar={<Btn onClick={() => { setEditing({ isActive: 1 }); setOpen(true); }}>{t('add')}</Btn>}>
      <Table<Dept>
        rows={data}
        cols={[
          { key: 'code', header: t('code'), className: 'w-32 ltr-num' },
          { key: 'name', header: t('name') },
          { key: 'nameEn', header: 'Name (EN)' },
          { key: 'isActive', header: t('active'), render: r => r.isActive ? '✓' : '—', className: 'w-20' },
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
          <div><Label>{t('active')}</Label>
            <select value={editing.isActive ?? 1} onChange={e => setEditing({ ...editing, isActive: Number(e.target.value) })}
              className="bg-bg2 border border-line rounded-md px-2 py-1.5 text-sm w-full">
              <option value={1}>{t('yes')}</option><option value={0}>{t('no')}</option>
            </select>
          </div>
          <div className="col-span-2"><Label>{t('name')}</Label><Input value={editing.name ?? ''} onChange={e => setEditing({ ...editing, name: e.target.value })} /></div>
          <div className="col-span-2"><Label>Name (EN)</Label><Input value={editing.nameEn ?? ''} onChange={e => setEditing({ ...editing, nameEn: e.target.value })} /></div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <Btn variant="ghost" onClick={() => setOpen(false)}>{t('cancel')}</Btn>
          <Btn onClick={save}>{t('save')}</Btn>
        </div>
      </Modal>
    </Page>
  );
}
