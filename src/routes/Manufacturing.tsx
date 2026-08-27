import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { api } from '../lib/ipc';
import type { Item, Warehouse } from '@shared/types';
import { Btn, Card, Input, Label, Modal, Page, Select, Table } from '../components/ui';
import { today } from '../lib/money';

interface FormulaRow {
  id: number; code: string; name: string; outputItemId: number; outputQty: string;
  notes: string | null; isActive: 0 | 1; outputItemCode: string; outputItemName: string; lineCount: number;
}
interface FormulaLine { itemId: number; qty: string; wastePct: string }
interface FormulaEdit extends Partial<FormulaRow> { lines?: FormulaLine[] }
interface RunRow {
  id: number; serial: string; date: string; outputQty: string; notes: string | null;
  formulaCode: string; formulaName: string; warehouseName: string; outputItemCode: string; outputItemName: string;
}

export default function ManufacturingPage(): JSX.Element {
  const { t } = useTranslation();
  const tn = useTranslation('nav').t;
  const qc = useQueryClient();
  const [formulaOpen, setFormulaOpen] = useState(false);
  const [runOpen, setRunOpen] = useState(false);
  const [editing, setEditing] = useState<FormulaEdit>({ lines: [] });
  const [run, setRun] = useState({ date: today(), formulaId: 0, warehouseId: 0, outputQty: '1', notes: '' });

  const { data: formulas = [] } = useQuery<FormulaRow[]>({ queryKey: ['mfg-formulas'], queryFn: () => api.manufacturing.formulasList() as Promise<FormulaRow[]> });
  const { data: runs = [] } = useQuery<RunRow[]>({ queryKey: ['mfg-runs'], queryFn: () => api.manufacturing.runsList() as Promise<RunRow[]> });
  const { data: items = [] } = useQuery<Item[]>({ queryKey: ['items'], queryFn: () => api.items.list() as Promise<Item[]> });
  const { data: warehouses = [] } = useQuery<Warehouse[]>({ queryKey: ['warehouses'], queryFn: () => api.warehouses.list() as Promise<Warehouse[]> });

  const resetFormula = (): void => setEditing({ outputQty: '1', isActive: 1, lines: [] });
  const editFormula = async (row: FormulaRow): Promise<void> => {
    const full = await api.manufacturing.formulaGet(row.id) as FormulaEdit;
    setEditing({ ...full, lines: full.lines ?? [] });
    setFormulaOpen(true);
  };
  const saveFormula = async (): Promise<void> => {
    const r = await api.manufacturing.formulaSave(editing) as { ok: boolean; error?: string };
    if (!r.ok) { alert(r.error ?? t('error')); return; }
    setFormulaOpen(false); resetFormula();
    void qc.invalidateQueries({ queryKey: ['mfg-formulas'] });
  };
  const deleteFormula = async (id: number): Promise<void> => {
    if (!confirm(t('confirmDelete'))) return;
    const r = await api.manufacturing.formulaDelete(id) as { ok: boolean; error?: string };
    if (!r.ok) { alert(r.error ?? t('error')); return; }
    void qc.invalidateQueries({ queryKey: ['mfg-formulas'] });
  };
  const saveRun = async (): Promise<void> => {
    const r = await api.manufacturing.runSave(run) as { ok: boolean; error?: string };
    if (!r.ok) { alert(r.error ?? t('error')); return; }
    setRunOpen(false);
    setRun({ date: today(), formulaId: 0, warehouseId: 0, outputQty: '1', notes: '' });
    void qc.invalidateQueries({ queryKey: ['mfg-runs'] });
    void qc.invalidateQueries({ queryKey: ['stockMovements'] });
    void qc.invalidateQueries({ queryKey: ['items'] });
  };

  const lines = editing.lines ?? [];
  const setLine = (index: number, patch: Partial<FormulaLine>): void => {
    setEditing({ ...editing, lines: lines.map((l, i) => i === index ? { ...l, ...patch } : l) });
  };

  return (
    <Page title={tn('manufacturing')} toolbar={<div className="flex gap-2">
      <Btn variant="ghost" onClick={() => { setRun({ date: today(), formulaId: formulas[0]?.id ?? 0, warehouseId: warehouses[0]?.id ?? 0, outputQty: '1', notes: '' }); setRunOpen(true); }}>{t('manufacture')}</Btn>
      <Btn onClick={() => { resetFormula(); setFormulaOpen(true); }}>{t('add')}</Btn>
    </div>}>
      <Card className="mb-4">
        <h3 className="font-semibold mb-2">{t('formulas')}</h3>
        <Table<FormulaRow>
          rows={formulas}
          cols={[
            { key: 'code', header: t('code'), className: 'ltr-num w-24' },
            { key: 'name', header: t('name') },
            { key: 'outputItemName', header: t('outputItem'), render: r => `${r.outputItemCode} — ${r.outputItemName}` },
            { key: 'outputQty', header: t('outputQty'), className: 'ltr-num text-end w-28' },
            { key: 'lineCount', header: t('components'), className: 'ltr-num text-end w-24' },
            { key: 'actions', header: t('actions'), className: 'w-44 text-end', render: r => <>
              <Btn variant="ghost" onClick={() => void editFormula(r)}>{t('edit')}</Btn>{' '}
              <Btn variant="danger" onClick={() => void deleteFormula(r.id)}>{t('delete')}</Btn>
            </> }
          ]}
        />
      </Card>
      <Card>
        <h3 className="font-semibold mb-2">{t('manufacturingRuns')}</h3>
        <Table<RunRow>
          rows={runs}
          cols={[
            { key: 'serial', header: t('reference'), className: 'ltr-num w-32' },
            { key: 'date', header: t('date'), className: 'ltr-num w-28' },
            { key: 'formulaName', header: t('formula'), render: r => `${r.formulaCode} — ${r.formulaName}` },
            { key: 'outputItemName', header: t('outputItem'), render: r => `${r.outputItemCode} — ${r.outputItemName}` },
            { key: 'warehouseName', header: t('warehouse') },
            { key: 'outputQty', header: t('qty'), className: 'ltr-num text-end w-24' }
          ]}
        />
      </Card>

      <Modal open={formulaOpen} onClose={() => setFormulaOpen(false)} title={editing.id ? t('edit') : t('add')} wide>
        <div className="grid grid-cols-4 gap-3">
          <div><Label>{t('code')}</Label><Input value={editing.code ?? ''} onChange={e => setEditing({ ...editing, code: e.target.value })} /></div>
          <div className="col-span-2"><Label>{t('name')}</Label><Input value={editing.name ?? ''} onChange={e => setEditing({ ...editing, name: e.target.value })} /></div>
          <div><Label>{t('outputQty')}</Label><Input className="ltr-num" value={editing.outputQty ?? '1'} onChange={e => setEditing({ ...editing, outputQty: e.target.value })} /></div>
          <div className="col-span-2"><Label>{t('outputItem')}</Label>
            <Select className="w-full" value={editing.outputItemId ?? 0} onChange={e => setEditing({ ...editing, outputItemId: Number(e.target.value) })}>
              <option value={0}>—</option>
              {items.map(i => <option key={i.id} value={i.id}>{i.code} — {i.name}</option>)}
            </Select>
          </div>
          <div className="col-span-2"><Label>{t('notes')}</Label><Input value={editing.notes ?? ''} onChange={e => setEditing({ ...editing, notes: e.target.value })} /></div>
        </div>
        <div className="mt-4 flex items-center gap-2">
          <h3 className="text-sm font-semibold">{t('components')}</h3>
          <Btn variant="ghost" onClick={() => setEditing({ ...editing, lines: [...lines, { itemId: items[0]?.id ?? 0, qty: '1', wastePct: '0' }] })}>+ {t('add')}</Btn>
        </div>
        <table className="w-full text-sm mt-2">
          <thead className="text-fg2 text-xs"><tr><th className="text-start py-1">{t('item')}</th><th className="text-end w-28">{t('qty')}</th><th className="text-end w-28">{t('wastePct')}</th><th className="w-10" /></tr></thead>
          <tbody>{lines.map((line, index) => (
            <tr key={index} className="border-t border-line">
              <td><Select className="w-full" value={line.itemId} onChange={e => setLine(index, { itemId: Number(e.target.value) })}>{items.map(i => <option key={i.id} value={i.id}>{i.code} — {i.name}</option>)}</Select></td>
              <td><Input className="ltr-num text-end w-full" value={line.qty} onChange={e => setLine(index, { qty: e.target.value })} /></td>
              <td><Input className="ltr-num text-end w-full" value={line.wastePct} onChange={e => setLine(index, { wastePct: e.target.value })} /></td>
              <td className="text-end"><button className="text-rose-400" onClick={() => setEditing({ ...editing, lines: lines.filter((_, i) => i !== index) })}>×</button></td>
            </tr>
          ))}</tbody>
        </table>
        <div className="flex justify-end gap-2 mt-4"><Btn variant="ghost" onClick={() => setFormulaOpen(false)}>{t('cancel')}</Btn><Btn onClick={saveFormula}>{t('save')}</Btn></div>
      </Modal>

      <Modal open={runOpen} onClose={() => setRunOpen(false)} title={t('manufacture')}>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>{t('date')}</Label><Input type="date" className="ltr-num" value={run.date} onChange={e => setRun({ ...run, date: e.target.value })} /></div>
          <div><Label>{t('outputQty')}</Label><Input className="ltr-num" value={run.outputQty} onChange={e => setRun({ ...run, outputQty: e.target.value })} /></div>
          <div className="col-span-2"><Label>{t('formula')}</Label><Select value={run.formulaId} onChange={e => setRun({ ...run, formulaId: Number(e.target.value) })}><option value={0}>—</option>{formulas.filter(f => f.isActive).map(f => <option key={f.id} value={f.id}>{f.code} — {f.name}</option>)}</Select></div>
          <div className="col-span-2"><Label>{t('warehouse')}</Label><Select value={run.warehouseId} onChange={e => setRun({ ...run, warehouseId: Number(e.target.value) })}><option value={0}>—</option>{warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</Select></div>
          <div className="col-span-2"><Label>{t('notes')}</Label><Input value={run.notes} onChange={e => setRun({ ...run, notes: e.target.value })} /></div>
        </div>
        <div className="flex justify-end gap-2 mt-4"><Btn variant="ghost" onClick={() => setRunOpen(false)}>{t('cancel')}</Btn><Btn onClick={saveRun}>{t('manufacture')}</Btn></div>
      </Modal>
    </Page>
  );
}