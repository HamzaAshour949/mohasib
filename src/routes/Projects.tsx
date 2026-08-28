import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { api } from '../lib/ipc';
import { Btn, Input, Label, Modal, Page, Table } from '../components/ui';
import { useNamesById } from '../lib/lookup';
import { describeError } from '../lib/errors';

interface Project { id: number; code: string; name: string; nameEn: string | null; departmentId: number | null; isActive: number }
interface Dept { id: number; code: string; name: string }

export default function ProjectsPage(): JSX.Element {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Partial<Project>>({});

  const { data = [] } = useQuery<Project[]>({ queryKey: ['projects'], queryFn: () => api.projects.list() as Promise<Project[]> });
  const { data: depts = [] } = useQuery<Dept[]>({ queryKey: ['departments'], queryFn: () => api.departments.list() as Promise<Dept[]> });

  const lookupDept = useNamesById(depts, d => d.name);
  const deptName = (id: number | null): string => lookupDept(id) || '—';

  const save = async (): Promise<void> => {
    const r = await api.projects.save(editing) as { ok: boolean; error?: string };
    if (!r.ok) { alert(describeError(t, r)); return; }
    setOpen(false); setEditing({});
    void qc.invalidateQueries({ queryKey: ['projects'] });
  };
  const remove = async (id: number): Promise<void> => {
    if (!confirm(t('confirmDelete'))) return;
    const r = await api.projects.delete(id) as { ok: boolean; error?: string };
    if (!r.ok) { alert(describeError(t, r)); return; }
    void qc.invalidateQueries({ queryKey: ['projects'] });
  };

  return (
    <Page title={t('projects')} toolbar={<Btn onClick={() => { setEditing({ isActive: 1 }); setOpen(true); }}>{t('add')}</Btn>}>
      <Table<Project>
        rows={data}
        cols={[
          { key: 'code', header: t('code'), className: 'w-32 ltr-num' },
          { key: 'name', header: t('name') },
          { key: 'nameEn', header: 'Name (EN)' },
          { key: 'departmentId', header: t('department'), render: r => deptName(r.departmentId) },
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
          <div><Label>{t('department')}</Label>
            <select value={editing.departmentId ?? ''} onChange={e => setEditing({ ...editing, departmentId: e.target.value ? Number(e.target.value) : null })}
              className="bg-bg2 border border-line rounded-md px-2 py-1.5 text-sm w-full">
              <option value="">—</option>
              {depts.map(d => <option key={d.id} value={d.id}>{d.code} — {d.name}</option>)}
            </select>
          </div>
          <div className="col-span-2"><Label>{t('name')}</Label><Input value={editing.name ?? ''} onChange={e => setEditing({ ...editing, name: e.target.value })} /></div>
          <div className="col-span-2"><Label>Name (EN)</Label><Input value={editing.nameEn ?? ''} onChange={e => setEditing({ ...editing, nameEn: e.target.value })} /></div>
          <div><Label>{t('active')}</Label>
            <select value={editing.isActive ?? 1} onChange={e => setEditing({ ...editing, isActive: Number(e.target.value) })}
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
