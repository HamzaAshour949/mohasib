import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { api } from '../lib/ipc';
import type { Party, PartyKind } from '@shared/types';
import { Btn, Input, Label, Modal, Page, Select, Table } from '../components/ui';
import { exportRows } from '../lib/csv';
import { describeError } from '../lib/errors';

export default function PartiesPage(): JSX.Element {
  const { t } = useTranslation();
  const tf = useTranslation('forms').t;
  const tn = useTranslation('nav').t;
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Partial<Party>>({});

  const { data: parties = [] } = useQuery<Party[]>({
    queryKey: ['parties'],
    queryFn: () => api.parties.list() as Promise<Party[]>
  });

  const save = async () => {
    const payload = { ...editing, kind: editing.kind ?? 'customer' as PartyKind };
    const res = await api.parties.save(payload) as { ok: boolean; error?: string };
    if (!res.ok) { alert(describeError(t, res)); return; }
    setOpen(false); setEditing({});
    void qc.invalidateQueries({ queryKey: ['parties'] });
  };

  return (
    <Page title={tn('parties')} toolbar={
      <div className="flex gap-2">
        <Btn variant="ghost" onClick={() => exportRows('parties', parties, [
          { header: 'Code', value: r => r.code },
          { header: 'Name', value: r => r.name },
          { header: 'Name EN', value: r => r.nameEn ?? '' },
          { header: 'Kind', value: r => r.kind },
          { header: 'Phone', value: r => r.phone ?? '' },
          { header: 'Email', value: r => r.email ?? '' },
          { header: 'Address', value: r => r.address ?? '' }
        ])}>{t('exportCsv')}</Btn>
        <Btn onClick={() => { setEditing({}); setOpen(true); }}>{t('add')}</Btn>
      </div>
    }>
      <Table<Party>
        rows={parties}
        cols={[
          { key: 'code', header: t('code'), className: 'ltr-num w-24' },
          { key: 'name', header: t('name') },
          { key: 'kind', header: tf('kind'), render: r => tf(r.kind) },
          { key: 'phone', header: tf('phone'), className: 'ltr-num' },
          { key: 'actions', header: t('actions'), className: 'w-32 text-end',
            render: r => <Btn variant="ghost" onClick={() => { setEditing(r); setOpen(true); }}>{t('edit')}</Btn> }
        ]}
      />
      <Modal open={open} onClose={() => setOpen(false)} title={editing.id ? t('edit') : t('add')}>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>{t('code')}</Label><Input value={editing.code ?? ''} onChange={e => setEditing({ ...editing, code: e.target.value })} /></div>
          <div>
            <Label>{tf('kind')}</Label>
            <Select value={editing.kind ?? 'customer'} onChange={e => setEditing({ ...editing, kind: e.target.value as PartyKind })}>
              {(['customer','supplier','both','employee'] as const).map(k => <option key={k} value={k}>{tf(k)}</option>)}
            </Select>
          </div>
          <div className="col-span-2"><Label>{t('name')}</Label><Input value={editing.name ?? ''} onChange={e => setEditing({ ...editing, name: e.target.value })} /></div>
          <div className="col-span-2"><Label>Name (EN)</Label><Input value={editing.nameEn ?? ''} onChange={e => setEditing({ ...editing, nameEn: e.target.value })} /></div>
          <div><Label>{tf('phone')}</Label><Input value={editing.phone ?? ''} onChange={e => setEditing({ ...editing, phone: e.target.value })} /></div>
          <div><Label>{tf('email')}</Label><Input value={editing.email ?? ''} onChange={e => setEditing({ ...editing, email: e.target.value })} /></div>
          <div className="col-span-2"><Label>{tf('address')}</Label><Input value={editing.address ?? ''} onChange={e => setEditing({ ...editing, address: e.target.value })} /></div>
          <div className="col-span-2"><Label>{tf('notes')}</Label><Input value={editing.notes ?? ''} onChange={e => setEditing({ ...editing, notes: e.target.value })} /></div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <Btn variant="ghost" onClick={() => setOpen(false)}>{t('cancel')}</Btn>
          <Btn onClick={save}>{t('save')}</Btn>
        </div>
      </Modal>
    </Page>
  );
}
