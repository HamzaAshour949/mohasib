import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { api } from '../lib/ipc';
import type { Warehouse } from '@shared/types';
import { Btn, Input, Label, Modal, Page, Table } from '../components/ui';
import { describeError } from '../lib/errors';

export default function WarehousesPage(): JSX.Element {
  const { t } = useTranslation();
  const tn = useTranslation('nav').t;
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Partial<Warehouse>>({});

  const { data = [] } = useQuery<Warehouse[]>({ queryKey: ['warehouses'], queryFn: () => api.warehouses.list() as Promise<Warehouse[]> });

  const save = async () => {
    const r = await api.warehouses.save(editing) as { ok: boolean; error?: string };
    if (!r.ok) { alert(describeError(t, r)); return; }
    setOpen(false); setEditing({});
    void qc.invalidateQueries({ queryKey: ['warehouses'] });
  };

  return (
    <Page title={tn('warehouses')} toolbar={<Btn onClick={() => { setEditing({}); setOpen(true); }}>{t('add')}</Btn>}>
      <Table<Warehouse>
        rows={data}
        cols={[
          { key: 'code', header: t('code'), className: 'w-24 ltr-num' },
          { key: 'name', header: t('name') },
          { key: 'isDefault', header: 'Default', render: r => r.isDefault ? '✓' : '' },
          { key: 'actions', header: t('actions'), className: 'w-32 text-end',
            render: r => <Btn variant="ghost" onClick={() => { setEditing(r); setOpen(true); }}>{t('edit')}</Btn> }
        ]}
      />
      <Modal open={open} onClose={() => setOpen(false)} title={editing.id ? t('edit') : t('add')}>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>{t('code')}</Label><Input value={editing.code ?? ''} onChange={e => setEditing({ ...editing, code: e.target.value })} /></div>
          <div><Label>Default</Label>
            <select value={editing.isDefault ?? 0} onChange={e => setEditing({ ...editing, isDefault: Number(e.target.value) as 0|1 })} className="bg-bg2 border border-line rounded-md px-2 py-1.5 text-sm w-full">
              <option value={0}>{t('no')}</option><option value={1}>{t('yes')}</option>
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
