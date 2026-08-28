import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { api } from '../lib/ipc';
import type { Item, Warehouse } from '@shared/types';
import { Btn, Input, Label, Modal, Page, Select, Table } from '../components/ui';
import { majorToMinor, today } from '../lib/money';
import { describeError } from '../lib/errors';

interface SM {
  id: number; serial: string; date: string; kind: string;
  fromWarehouseId: number | null; toWarehouseId: number | null;
  fromWarehouseName: string | null; toWarehouseName: string | null;
  notes: string | null; lineCount: number;
}

interface Line { itemId: number; qty: string; costMajor: string }

export default function StockMovementsPage(): JSX.Element {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(today());
  const [kind, setKind] = useState<'transfer' | 'adjust_in' | 'adjust_out' | 'opening' | 'count'>('transfer');
  const [fromWarehouseId, setFromWarehouseId] = useState<number | ''>('');
  const [toWarehouseId, setToWarehouseId] = useState<number | ''>('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<Line[]>([]);

  const { data = [] } = useQuery<SM[]>({ queryKey: ['stockMovements'], queryFn: () => api.stockMovements.list() as Promise<SM[]> });
  const { data: warehouses = [] } = useQuery<Warehouse[]>({ queryKey: ['warehouses'], queryFn: () => api.warehouses.list() as Promise<Warehouse[]> });
  const { data: items = [] } = useQuery<Item[]>({ queryKey: ['items'], queryFn: () => api.items.list() as Promise<Item[]> });

  const reset = (): void => {
    setDate(today()); setKind('transfer'); setFromWarehouseId(''); setToWarehouseId('');
    setNotes(''); setLines([]);
  };
  const addLine = (): void => setLines([...lines, { itemId: items[0]?.id ?? 0, qty: '1', costMajor: '0' }]);
  const upd = (i: number, p: Partial<Line>): void => setLines(lines.map((l, idx) => idx === i ? { ...l, ...p } : l));
  const rm = (i: number): void => setLines(lines.filter((_, idx) => idx !== i));

  const save = async (): Promise<void> => {
    if (lines.length === 0) { alert(t('atLeastOneLine')); return; }
    if (kind === 'count') {
      // Stock-count (جرد): user enters target qty per item; we compute diff against
      // current on-hand for the chosen warehouse and post adjust_in / adjust_out lines.
      if (!toWarehouseId) { alert(t('warehouseRequiredForCount')); return; }
      const wh = Number(toWarehouseId);
      const incLines: typeof lines = [];
      const decLines: typeof lines = [];
      for (const l of lines) {
        const r = await api.extraReports.stockOnHand(l.itemId, wh) as { qty: number };
        const diff = Number(l.qty) - r.qty;
        if (diff > 0) incLines.push({ ...l, qty: String(diff) });
        else if (diff < 0) decLines.push({ ...l, qty: String(-diff) });
      }
      const memo = `جرد / Stock count ${date}${notes ? ' — ' + notes : ''}`;
      const tasks: Array<Promise<unknown>> = [];
      if (incLines.length) tasks.push(api.stockMovements.save({
        date, kind: 'adjust_in', notes: memo, fromWarehouseId: null, toWarehouseId: wh,
        lines: incLines.map(l => ({ itemId: l.itemId, qty: l.qty, unitCostMinor: majorToMinor(l.costMajor) }))
      }));
      if (decLines.length) tasks.push(api.stockMovements.save({
        date, kind: 'adjust_out', notes: memo, fromWarehouseId: wh, toWarehouseId: null,
        lines: decLines.map(l => ({ itemId: l.itemId, qty: l.qty, unitCostMinor: majorToMinor(l.costMajor) }))
      }));
      const results = await Promise.all(tasks) as Array<{ ok: boolean; error?: string }>;
      const fail = results.find(r => !r.ok);
      if (fail) { alert(describeError(t, fail)); return; }
      if (tasks.length === 0) { alert(t('noData')); return; }
      setOpen(false); reset();
      void qc.invalidateQueries({ queryKey: ['stockMovements'] });
      void qc.invalidateQueries({ queryKey: ['items'] });
      return;
    }
    const payload = {
      date, kind, notes,
      fromWarehouseId: fromWarehouseId ? Number(fromWarehouseId) : null,
      toWarehouseId: toWarehouseId ? Number(toWarehouseId) : null,
      lines: lines.map(l => ({ itemId: l.itemId, qty: l.qty, unitCostMinor: majorToMinor(l.costMajor) }))
    };
    const r = await api.stockMovements.save(payload) as { ok: boolean; error?: string };
    if (!r.ok) { alert(describeError(t, r)); return; }
    setOpen(false); reset();
    void qc.invalidateQueries({ queryKey: ['stockMovements'] });
    void qc.invalidateQueries({ queryKey: ['items'] });
  };

  return (
    <Page title={t('stockMovements')} toolbar={<Btn onClick={() => { reset(); setOpen(true); }}>{t('new')}</Btn>}>
      <Table<SM>
        rows={data}
        cols={[
          { key: 'serial', header: t('reference'), className: 'w-32 ltr-num' },
          { key: 'date', header: t('date'), className: 'w-28 ltr-num' },
          { key: 'kind', header: t('type'), render: r => t(r.kind === 'adjust_in' ? 'adjustIn' : r.kind === 'adjust_out' ? 'adjustOut' : r.kind) },
          { key: 'fromWarehouseName', header: 'From' },
          { key: 'toWarehouseName', header: 'To' },
          { key: 'lineCount', header: 'Lines', className: 'ltr-num text-end w-20' },
          { key: 'notes', header: t('notes') }
        ]}
      />
      <Modal open={open} onClose={() => setOpen(false)} title={t('new')} wide>
        <div className="grid grid-cols-4 gap-3">
          <div><Label>{t('date')}</Label><Input type="date" className="ltr-num" value={date} onChange={e => setDate(e.target.value)} /></div>
          <div><Label>{t('type')}</Label>
            <Select value={kind} onChange={e => setKind(e.target.value as typeof kind)}>
              <option value="transfer">{t('transfer')}</option>
              <option value="adjust_in">{t('adjustIn')}</option>
              <option value="adjust_out">{t('adjustOut')}</option>
              <option value="opening">{t('opening')}</option>
              <option value="count">{t('count')}</option>
            </Select>
          </div>
          {(kind === 'transfer' || kind === 'adjust_out') && (
            <div><Label>From</Label>
              <Select value={fromWarehouseId} onChange={e => setFromWarehouseId(e.target.value ? Number(e.target.value) : '')}>
                <option value="">—</option>
                {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
              </Select>
            </div>
          )}
          {(kind === 'transfer' || kind === 'adjust_in' || kind === 'opening' || kind === 'count') && (
            <div><Label>{kind === 'count' ? t('warehouse') : 'To'}</Label>
              <Select value={toWarehouseId} onChange={e => setToWarehouseId(e.target.value ? Number(e.target.value) : '')}>
                <option value="">—</option>
                {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
              </Select>
            </div>
          )}
        </div>
        <div className="mt-4 flex items-center gap-2">
          <h3 className="text-sm font-semibold">{t('item')}</h3>
          <Btn variant="ghost" onClick={addLine}>+ {t('add')}</Btn>
        </div>
        <table className="w-full text-sm mt-2">
          <thead className="text-fg2 text-xs">
            <tr>
              <th className="text-start py-1">{t('item')}</th>
              <th className="text-end ltr-num w-24">{t('qty')}</th>
              {(kind === 'adjust_in' || kind === 'opening') && <th className="text-end ltr-num w-32">Unit cost</th>}
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={i} className="border-t border-line">
                <td><Select className="w-full" value={l.itemId} onChange={e => upd(i, { itemId: Number(e.target.value) })}>
                  {items.map(it => <option key={it.id} value={it.id}>{it.code} — {it.name}</option>)}
                </Select></td>
                <td><Input className="ltr-num text-end w-full" value={l.qty} onChange={e => upd(i, { qty: e.target.value })} /></td>
                {(kind === 'adjust_in' || kind === 'opening') && (
                  <td><Input className="ltr-num text-end w-full" value={l.costMajor} onChange={e => upd(i, { costMajor: e.target.value })} /></td>
                )}
                <td className="text-end"><button className="text-rose-400" onClick={() => rm(i)}>×</button></td>
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
