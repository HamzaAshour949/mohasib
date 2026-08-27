import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { api } from '../lib/ipc';
import type { Item } from '@shared/types';
import { Btn, Input, Label, Modal, Page, Select, Table } from '../components/ui';
import { formatMoney, majorToMinor, minorToMajor } from '../lib/money';
import { exportRows } from '../lib/csv';

const empty: Partial<Item> = {
  code: '', name: '', unit: 'pcs', currency: 'USD',
  salePrices: ['0','0','0','0','0'], purchasePrices: ['0','0','0','0','0'],
  minQty: '0', reorderQty: '0', maxQty: '0', itemType: 'stock'
};

export default function ItemsPage(): JSX.Element {
  const { t } = useTranslation();
  const tf = useTranslation('forms').t;
  const tn = useTranslation('nav').t;
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Partial<Item>>(empty);

  const { data: items = [] } = useQuery<Item[]>({
    queryKey: ['items'],
    queryFn: () => api.items.list() as Promise<Item[]>
  });

  const save = async () => {
    const payload = { ...empty, ...editing };
    const res = await api.items.save(payload) as { ok: boolean; error?: string };
    if (!res.ok) { alert(res.error || t('error')); return; }
    setOpen(false); setEditing(empty);
    void qc.invalidateQueries({ queryKey: ['items'] });
  };

  const setSale = (i: number, val: string) => {
    const p = [...(editing.salePrices ?? empty.salePrices!)] as Item['salePrices'];
    p[i] = majorToMinor(val);
    setEditing({ ...editing, salePrices: p });
  };
  const setPurchase = (i: number, val: string) => {
    const p = [...(editing.purchasePrices ?? empty.purchasePrices!)] as Item['purchasePrices'];
    p[i] = majorToMinor(val);
    setEditing({ ...editing, purchasePrices: p });
  };

  return (
    <Page title={tn('items')} toolbar={
      <div className="flex gap-2">
        <Btn variant="ghost" onClick={() => exportRows('items', items, [
          { header: 'Code', value: r => r.code },
          { header: 'Barcode', value: r => r.barcode ?? '' },
          { header: 'Name', value: r => r.name },
          { header: 'Name EN', value: r => r.nameEn ?? '' },
          { header: 'Unit', value: r => r.unit },
          { header: 'Sale 1', value: r => minorToMajor(r.salePrices[0]) },
          { header: 'Sale 2', value: r => minorToMajor(r.salePrices[1]) },
          { header: 'Sale 3', value: r => minorToMajor(r.salePrices[2]) },
          { header: 'Sale 4', value: r => minorToMajor(r.salePrices[3]) },
          { header: 'Sale 5', value: r => minorToMajor(r.salePrices[4]) },
          { header: 'Purchase 1', value: r => minorToMajor(r.purchasePrices[0]) },
          { header: 'Min qty', value: r => r.minQty },
          { header: 'Reorder', value: r => r.reorderQty },
          { header: 'Currency', value: r => r.currency }
        ])}>{t('exportCsv')}</Btn>
        <Btn onClick={() => { setEditing(empty); setOpen(true); }}>{t('add')}</Btn>
      </div>
    }>
      <Table<Item>
        rows={items}
        cols={[
          { key: 'code', header: t('code'), className: 'ltr-num w-24' },
          { key: 'name', header: t('name') },
          { key: 'unit', header: tf('unit'), className: 'w-20' },
          { key: 'salePrices', header: t('unitPrice'), className: 'ltr-num text-end',
            render: r => formatMoney(r.salePrices[0], r.currency) },
          { key: 'minQty', header: tf('minQty'), className: 'ltr-num text-end' },
          { key: 'actions', header: t('actions'), className: 'w-32 text-end',
            render: r => <Btn variant="ghost" onClick={() => { setEditing(r); setOpen(true); }}>{t('edit')}</Btn> }
        ]}
      />
      <Modal open={open} onClose={() => setOpen(false)} title={editing.id ? t('edit') : t('add')} wide>
        <div className="grid grid-cols-3 gap-3">
          <div><Label>{t('code')}</Label><Input value={editing.code ?? ''} onChange={e => setEditing({ ...editing, code: e.target.value })} /></div>
          <div><Label>{tf('barcode')}</Label><Input value={editing.barcode ?? ''} onChange={e => setEditing({ ...editing, barcode: e.target.value })} /></div>
          <div>
            <Label>{tf('kind')}</Label>
            <Select value={editing.itemType ?? 'stock'} onChange={e => setEditing({ ...editing, itemType: e.target.value as Item['itemType'] })}>
              <option value="stock">{tf('stock')}</option>
              <option value="service">{tf('service')}</option>
              <option value="non_stock">{tf('nonStock')}</option>
            </Select>
          </div>
          <div className="col-span-2"><Label>{t('name')}</Label><Input value={editing.name ?? ''} onChange={e => setEditing({ ...editing, name: e.target.value })} /></div>
          <div><Label>Name (EN)</Label><Input value={editing.nameEn ?? ''} onChange={e => setEditing({ ...editing, nameEn: e.target.value })} /></div>
          <div><Label>{tf('unit')}</Label><Input value={editing.unit ?? 'pcs'} onChange={e => setEditing({ ...editing, unit: e.target.value })} /></div>
          <div><Label>{t('currency')}</Label><Input value={editing.currency ?? 'USD'} onChange={e => setEditing({ ...editing, currency: e.target.value })} /></div>
          <div />
          <div className="col-span-3">
            <Label>{tf('salePrices')}</Label>
            <div className="grid grid-cols-5 gap-2">
              {(editing.salePrices ?? empty.salePrices!).map((p, i) => (
                <Input key={i} className="ltr-num" value={minorToMajor(p)} onChange={e => setSale(i, e.target.value)} />
              ))}
            </div>
          </div>
          <div className="col-span-3">
            <Label>{tf('purchasePrices')}</Label>
            <div className="grid grid-cols-5 gap-2">
              {(editing.purchasePrices ?? empty.purchasePrices!).map((p, i) => (
                <Input key={i} className="ltr-num" value={minorToMajor(p)} onChange={e => setPurchase(i, e.target.value)} />
              ))}
            </div>
          </div>
          <div><Label>{tf('minQty')}</Label><Input className="ltr-num" value={editing.minQty ?? '0'} onChange={e => setEditing({ ...editing, minQty: e.target.value })} /></div>
          <div><Label>{tf('reorderQty')}</Label><Input className="ltr-num" value={editing.reorderQty ?? '0'} onChange={e => setEditing({ ...editing, reorderQty: e.target.value })} /></div>
          <div><Label>{tf('maxQty')}</Label><Input className="ltr-num" value={editing.maxQty ?? '0'} onChange={e => setEditing({ ...editing, maxQty: e.target.value })} /></div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <Btn variant="ghost" onClick={() => setOpen(false)}>{t('cancel')}</Btn>
          <Btn onClick={save}>{t('save')}</Btn>
        </div>
      </Modal>
    </Page>
  );
}
