import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { NavLink, Route, Routes, useNavigate } from 'react-router-dom';
import { api } from '../lib/ipc';
import type { Account, Item, Party } from '@shared/types';
import { Btn, Card, Input, Label, Page, Select, Table } from '../components/ui';
import { ExportPrintBar } from '../components/ExportPrintBar';
import { formatMoney, today } from '../lib/money';

const SubNav: React.FC = () => {
  const tn = useTranslation('nav').t;
  const tabs: Array<[string, string]> = [
    ['', 'trialBalance'],
    ['ledger', 'ledger'],
    ['party', 'partyStatement'],
    ['inventory', 'inventoryBalance'],
    ['movement', 'inventoryMovement'],
    ['sales', 'salesSummary'],
    ['purchases', 'purchasesSummary'],
    ['ar', 'arAging'],
    ['ap', 'apAging'],
    ['income', 'incomeStatement'],
    ['balance', 'balanceSheet'],
    ['budget', 'budgetVsActual'],
    ['reorder', 'reorderAlert'],
    ['liquidity', 'bankLiquidity']
  ];
  return (
    <div className="flex gap-1 flex-wrap mb-4">
      {tabs.map(([path, key]) => (
        <NavLink
          key={path}
          to={path === '' ? '/reports' : `/reports/${path}`}
          end={path === ''}
          className={({ isActive }) =>
            `px-3 py-1.5 rounded-md text-sm ${isActive ? 'bg-accent text-bg' : 'bg-bg2 text-fg2 hover:bg-panel'}`
          }
        >
          {tn(key)}
        </NavLink>
      ))}
    </div>
  );
};

interface DateRange { from: string; to: string; }
const useRange = (): DateRange & { setFrom: (s: string) => void; setTo: (s: string) => void } => {
  const [from, setFrom] = useState(today().slice(0, 8) + '01');
  const [to, setTo] = useState(today());
  return { from, to, setFrom, setTo };
};

const RangeBar: React.FC<{ r: ReturnType<typeof useRange>; onRun: () => void }> = ({ r, onRun }) => {
  const { t } = useTranslation();
  return (
    <div className="flex gap-2 items-end mb-3">
      <div><Label>{t('from')}</Label><Input className="ltr-num" type="date" value={r.from} onChange={e => r.setFrom(e.target.value)} /></div>
      <div><Label>{t('to')}</Label><Input className="ltr-num" type="date" value={r.to} onChange={e => r.setTo(e.target.value)} /></div>
      <Btn onClick={onRun}>{t('search')}</Btn>
    </div>
  );
};

interface TBRow { id: number; code: string; name: string; type: string; debitMinor: string; creditMinor: string; balanceMinor: string; }

const TrialBalance: React.FC = () => {
  const { t } = useTranslation();
  const r = useRange();
  const { data = [], refetch } = useQuery<TBRow[]>({
    queryKey: ['tb', r.from, r.to],
    queryFn: () => api.reports.trialBalance(r.from, r.to) as Promise<TBRow[]>
  });
  const totalD = data.reduce((s, x) => s + BigInt(x.debitMinor), 0n);
  const totalC = data.reduce((s, x) => s + BigInt(x.creditMinor), 0n);
  return (
    <>
      <RangeBar r={r} onRun={() => refetch()} />
      <ExportPrintBar
        filename={`trial-balance-${r.from}_${r.to}`}
        title={`Trial Balance ${r.from} → ${r.to}`}
        rows={data}
        cols={[
          { header: t('code'), value: x => x.code },
          { header: t('name'), value: x => x.name },
          { header: t('debit'), value: x => formatMoney(x.debitMinor) },
          { header: t('credit'), value: x => formatMoney(x.creditMinor) },
          { header: t('balance'), value: x => formatMoney(x.balanceMinor) }
        ]}
        printSummary={`<table class="totals"><tr><td class="label">${t('debit')}</td><td class="num">${formatMoney(totalD.toString())}</td></tr><tr><td class="label">${t('credit')}</td><td class="num">${formatMoney(totalC.toString())}</td></tr></table>`}
      />
      <Table<TBRow>
        rows={data}
        cols={[
          { key: 'code', header: t('code'), className: 'ltr-num w-24' },
          { key: 'name', header: t('name') },
          { key: 'debitMinor', header: t('debit'), className: 'ltr-num text-end', render: x => formatMoney(x.debitMinor) },
          { key: 'creditMinor', header: t('credit'), className: 'ltr-num text-end', render: x => formatMoney(x.creditMinor) },
          { key: 'balanceMinor', header: t('balance'), className: 'ltr-num text-end', render: x => formatMoney(x.balanceMinor) }
        ]}
      />
      <Card className="mt-3 text-sm flex gap-6">
        <div>{t('debit')}: <span className="ltr-num font-semibold">{formatMoney(totalD.toString())}</span></div>
        <div>{t('credit')}: <span className="ltr-num font-semibold">{formatMoney(totalC.toString())}</span></div>
      </Card>
    </>
  );
};

interface LedgerRow { entryId: number | null; date: string; reference: string | null; memo: string; debitMinor: string; creditMinor: string; runningMinor: string; }

const SOURCE_ROUTE: Record<string, string> = {
  invoice: '/invoices', voucher: '/vouchers', expense: '/expenses', cheque: '/cheques',
  stockMovement: '/stock-movements', payroll: '/payroll', asset: '/assets', note: '/notes',
  multiVoucher: '/multi-vouchers', manufacturing: '/manufacturing', manual: '/journal'
};

const useDrillBack = (): ((entryId: number | null) => Promise<void>) => {
  const navigate = useNavigate();
  return async (entryId: number | null): Promise<void> => {
    if (!entryId) return;
    const r = await api.extraReports.sourceDoc(entryId) as { sourceType?: string; sourceId?: number; reference?: string } | undefined;
    const route = r?.sourceType ? (SOURCE_ROUTE[r.sourceType] ?? '/journal') : '/journal';
    navigate(route);
  };
};

const Ledger: React.FC = () => {
  const { t } = useTranslation();
  const r = useRange();
  const drill = useDrillBack();
  const [accountId, setAccountId] = useState<number | ''>('');
  const { data: accounts = [] } = useQuery<Account[]>({ queryKey: ['accounts'], queryFn: () => api.accounts.list() as Promise<Account[]> });
  const { data = [], refetch } = useQuery<LedgerRow[]>({
    queryKey: ['ledger', accountId, r.from, r.to],
    queryFn: () => accountId ? api.reports.accountLedger(Number(accountId), r.from, r.to) as Promise<LedgerRow[]> : Promise.resolve([]),
    enabled: !!accountId
  });
  return (
    <>
      <div className="flex gap-2 items-end mb-3">
        <div className="flex-1">
          <Label>Account</Label>
          <Select className="w-full" value={accountId} onChange={e => setAccountId(e.target.value ? Number(e.target.value) : '')}>
            <option value="">—</option>
            {accounts.map(a => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}
          </Select>
        </div>
        <div><Label>{t('from')}</Label><Input className="ltr-num" type="date" value={r.from} onChange={e => r.setFrom(e.target.value)} /></div>
        <div><Label>{t('to')}</Label><Input className="ltr-num" type="date" value={r.to} onChange={e => r.setTo(e.target.value)} /></div>
        <Btn onClick={() => refetch()}>{t('search')}</Btn>
      </div>
      <ExportPrintBar
        filename={`ledger-${accountId}-${r.from}_${r.to}`}
        title={`Ledger ${r.from} → ${r.to}`}
        rows={data}
        cols={[
          { header: t('date'), value: x => x.date },
          { header: t('reference'), value: x => x.reference ?? '' },
          { header: t('memo'), value: x => x.memo },
          { header: t('debit'), value: x => formatMoney(x.debitMinor) },
          { header: t('credit'), value: x => formatMoney(x.creditMinor) },
          { header: t('running'), value: x => formatMoney(x.runningMinor) }
        ]}
      />
      <Table<LedgerRow>
        rows={data}
        cols={[
          { key: 'date', header: t('date'), className: 'ltr-num w-28' },
          { key: 'reference', header: t('reference'), className: 'ltr-num w-32' },
          { key: 'memo', header: t('memo') },
          { key: 'debitMinor', header: t('debit'), className: 'ltr-num text-end', render: x => formatMoney(x.debitMinor) },
          { key: 'creditMinor', header: t('credit'), className: 'ltr-num text-end', render: x => formatMoney(x.creditMinor) },
          { key: 'runningMinor', header: t('running'), className: 'ltr-num text-end', render: x => formatMoney(x.runningMinor) },
          { key: 'entryId', header: t('drillBack'), className: 'w-20 text-end',
            render: x => x.entryId ? <Btn variant="ghost" onClick={() => void drill(x.entryId)}>→</Btn> : null }
        ]}
      />
    </>
  );
};

const PartyStatement: React.FC = () => {
  const { t } = useTranslation();
  const r = useRange();
  const [partyId, setPartyId] = useState<number | ''>('');
  const { data: parties = [] } = useQuery<Party[]>({ queryKey: ['parties'], queryFn: () => api.parties.list() as Promise<Party[]> });
  const { data = [], refetch } = useQuery<LedgerRow[]>({
    queryKey: ['party-stmt', partyId, r.from, r.to],
    queryFn: () => partyId ? api.reports.partyStatement(Number(partyId), r.from, r.to) as Promise<LedgerRow[]> : Promise.resolve([]),
    enabled: !!partyId
  });
  return (
    <>
      <div className="flex gap-2 items-end mb-3">
        <div className="flex-1">
          <Label>{useTranslation('forms').t('party')}</Label>
          <Select className="w-full" value={partyId} onChange={e => setPartyId(e.target.value ? Number(e.target.value) : '')}>
            <option value="">—</option>
            {parties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </div>
        <div><Label>{t('from')}</Label><Input className="ltr-num" type="date" value={r.from} onChange={e => r.setFrom(e.target.value)} /></div>
        <div><Label>{t('to')}</Label><Input className="ltr-num" type="date" value={r.to} onChange={e => r.setTo(e.target.value)} /></div>
        <Btn onClick={() => refetch()}>{t('search')}</Btn>
      </div>
      <Table<LedgerRow>
        rows={data}
        cols={[
          { key: 'date', header: t('date'), className: 'ltr-num w-28' },
          { key: 'reference', header: t('reference'), className: 'ltr-num w-32' },
          { key: 'memo', header: t('memo') },
          { key: 'debitMinor', header: t('debit'), className: 'ltr-num text-end', render: x => formatMoney(x.debitMinor) },
          { key: 'creditMinor', header: t('credit'), className: 'ltr-num text-end', render: x => formatMoney(x.creditMinor) },
          { key: 'runningMinor', header: t('running'), className: 'ltr-num text-end', render: x => formatMoney(x.runningMinor) }
        ]}
      />
    </>
  );
};

interface InvBalRow { itemId: number; code: string; name: string; unit: string; unitCostMinor: string; qty: number; stockValueMinor: string; }

const InventoryBalance: React.FC = () => {
  const { t } = useTranslation();
  const { data = [] } = useQuery<InvBalRow[]>({ queryKey: ['inv-bal'], queryFn: () => api.reports.inventoryBalance() as Promise<InvBalRow[]> });
  const total = data.reduce((s, x) => s + BigInt(x.stockValueMinor), 0n);
  return (
    <>
      <ExportPrintBar
        filename="inventory-balance"
        title="Inventory balance"
        rows={data}
        cols={[
          { header: t('code'), value: x => x.code },
          { header: t('name'), value: x => x.name },
          { header: 'Unit', value: x => x.unit },
          { header: t('qty'), value: x => x.qty },
          { header: 'Unit cost', value: x => formatMoney(x.unitCostMinor) },
          { header: t('amount'), value: x => formatMoney(x.stockValueMinor) }
        ]}
        printSummary={`<table class="totals"><tr><td class="label">${t('total')}</td><td class="num">${formatMoney(total.toString())}</td></tr></table>`}
      />
      <Table<InvBalRow>
        rows={data}
        cols={[
          { key: 'code', header: t('code'), className: 'ltr-num w-24' },
          { key: 'name', header: t('name') },
          { key: 'unit', header: 'Unit', className: 'w-16' },
          { key: 'qty', header: t('qty'), className: 'ltr-num text-end' },
          { key: 'unitCostMinor', header: 'Unit cost', className: 'ltr-num text-end', render: x => formatMoney(x.unitCostMinor) },
          { key: 'stockValueMinor', header: t('amount'), className: 'ltr-num text-end', render: x => formatMoney(x.stockValueMinor) }
        ]}
      />
      <Card className="mt-3 text-sm">{t('total')}: <span className="ltr-num font-semibold">{formatMoney(total.toString())}</span></Card>
    </>
  );
};

interface InvMoveRow { date: string; serial: string; kind: string; qty: string; unitPriceMinor: string; totalMinor: string; partyName: string; }

const InventoryMovement: React.FC = () => {
  const { t } = useTranslation();
  const r = useRange();
  const [itemId, setItemId] = useState<number | ''>('');
  const { data: items = [] } = useQuery<Item[]>({ queryKey: ['items'], queryFn: () => api.items.list() as Promise<Item[]> });
  const { data = [], refetch } = useQuery<InvMoveRow[]>({
    queryKey: ['inv-mv', itemId, r.from, r.to],
    queryFn: () => itemId ? api.reports.inventoryMovement(Number(itemId), r.from, r.to) as Promise<InvMoveRow[]> : Promise.resolve([]),
    enabled: !!itemId
  });
  return (
    <>
      <div className="flex gap-2 items-end mb-3">
        <div className="flex-1">
          <Label>Item</Label>
          <Select className="w-full" value={itemId} onChange={e => setItemId(e.target.value ? Number(e.target.value) : '')}>
            <option value="">—</option>
            {items.map(it => <option key={it.id} value={it.id}>{it.code} · {it.name}</option>)}
          </Select>
        </div>
        <div><Label>{t('from')}</Label><Input className="ltr-num" type="date" value={r.from} onChange={e => r.setFrom(e.target.value)} /></div>
        <div><Label>{t('to')}</Label><Input className="ltr-num" type="date" value={r.to} onChange={e => r.setTo(e.target.value)} /></div>
        <Btn onClick={() => refetch()}>{t('search')}</Btn>
      </div>
      <ExportPrintBar
        filename={`inventory-movement-${itemId}-${r.from}_${r.to}`}
        title={`Inventory movement ${r.from} → ${r.to}`}
        rows={data}
        cols={[
          { header: t('date'), value: x => x.date },
          { header: t('reference'), value: x => x.serial },
          { header: 'Kind', value: x => x.kind },
          { header: 'Party', value: x => x.partyName },
          { header: t('qty'), value: x => x.qty },
          { header: t('unitPrice'), value: x => formatMoney(x.unitPriceMinor) },
          { header: t('total'), value: x => formatMoney(x.totalMinor) }
        ]}
      />
      <Table<InvMoveRow>
        rows={data}
        cols={[
          { key: 'date', header: t('date'), className: 'ltr-num w-28' },
          { key: 'serial', header: t('reference'), className: 'ltr-num w-32' },
          { key: 'kind', header: 'Kind', className: 'w-24' },
          { key: 'partyName', header: 'Party' },
          { key: 'qty', header: t('qty'), className: 'ltr-num text-end' },
          { key: 'unitPriceMinor', header: t('unitPrice'), className: 'ltr-num text-end', render: x => formatMoney(x.unitPriceMinor) },
          { key: 'totalMinor', header: t('total'), className: 'ltr-num text-end', render: x => formatMoney(x.totalMinor) }
        ]}
      />
    </>
  );
};

interface SalesRow { date: string; serial: string; kind: string; partyName: string; grandTotalMinor: string; currency: string; }

const SummaryReport: React.FC<{ which: 'sales' | 'purchases' }> = ({ which }) => {
  const { t } = useTranslation();
  const r = useRange();
  const { data = [], refetch } = useQuery<SalesRow[]>({
    queryKey: [which, r.from, r.to],
    queryFn: () => (which === 'sales'
      ? api.reports.salesSummary(r.from, r.to)
      : api.reports.purchasesSummary(r.from, r.to)) as Promise<SalesRow[]>
  });
  const total = data.reduce((s, x) => s + BigInt(x.grandTotalMinor) * (x.kind.includes('return') ? -1n : 1n), 0n);
  return (
    <>
      <RangeBar r={r} onRun={() => refetch()} />
      <ExportPrintBar
        filename={`${which}-${r.from}_${r.to}`}
        title={`${which === 'sales' ? 'Sales' : 'Purchases'} ${r.from} → ${r.to}`}
        rows={data}
        cols={[
          { header: t('date'), value: x => x.date },
          { header: t('reference'), value: x => x.serial },
          { header: 'Kind', value: x => x.kind },
          { header: 'Party', value: x => x.partyName },
          { header: t('amount'), value: x => formatMoney(x.grandTotalMinor, x.currency) }
        ]}
        printSummary={`<table class="totals"><tr><td class="label">${t('total')}</td><td class="num">${formatMoney(total.toString())}</td></tr></table>`}
      />
      <Table<SalesRow>
        rows={data}
        cols={[
          { key: 'date', header: t('date'), className: 'ltr-num w-28' },
          { key: 'serial', header: t('reference'), className: 'ltr-num w-32' },
          { key: 'kind', header: 'Kind', className: 'w-24' },
          { key: 'partyName', header: 'Party' },
          { key: 'grandTotalMinor', header: t('amount'), className: 'ltr-num text-end',
            render: x => formatMoney(x.grandTotalMinor, x.currency) }
        ]}
      />
      <Card className="mt-3 text-sm">{t('total')}: <span className="ltr-num font-semibold">{formatMoney(total.toString())}</span></Card>
    </>
  );
};

interface AgingRow { partyId: number; code: string; name: string; balanceMinor: string; }

const Aging: React.FC<{ which: 'ar' | 'ap' }> = ({ which }) => {
  const { t } = useTranslation();
  const [asOf, setAsOf] = useState(today());
  const { data = [], refetch } = useQuery<AgingRow[]>({
    queryKey: ['aging', which, asOf],
    queryFn: () => (which === 'ar' ? api.reports.arAging(asOf) : api.reports.apAging(asOf)) as Promise<AgingRow[]>
  });
  const total = data.reduce((s, x) => s + BigInt(x.balanceMinor), 0n);
  return (
    <>
      <div className="flex gap-2 items-end mb-3">
        <div><Label>{t('to')}</Label><Input className="ltr-num" type="date" value={asOf} onChange={e => setAsOf(e.target.value)} /></div>
        <Btn onClick={() => refetch()}>{t('search')}</Btn>
      </div>
      <ExportPrintBar
        filename={`aging-${which}-${asOf}`}
        title={`${which.toUpperCase()} aging as of ${asOf}`}
        rows={data}
        cols={[
          { header: t('code'), value: x => x.code },
          { header: t('name'), value: x => x.name },
          { header: t('balance'), value: x => formatMoney(x.balanceMinor) }
        ]}
        printSummary={`<table class="totals"><tr><td class="label">${t('total')}</td><td class="num">${formatMoney(total.toString())}</td></tr></table>`}
      />
      <Table<AgingRow>
        rows={data}
        cols={[
          { key: 'code', header: t('code'), className: 'ltr-num w-24' },
          { key: 'name', header: t('name') },
          { key: 'balanceMinor', header: t('balance'), className: 'ltr-num text-end', render: x => formatMoney(x.balanceMinor) }
        ]}
      />
      <Card className="mt-3 text-sm">{t('total')}: <span className="ltr-num font-semibold">{formatMoney(total.toString())}</span></Card>
    </>
  );
};

interface IncomeStmt { lines: Array<{ code: string; name: string; type: string; amountMinor: string }>; totalRevenueMinor: string; totalExpenseMinor: string; netIncomeMinor: string; }

const IncomeStatement: React.FC = () => {
  const { t, i18n } = useTranslation();
  const r = useRange();
  const { data, refetch } = useQuery<IncomeStmt>({
    queryKey: ['income', r.from, r.to],
    queryFn: () => api.reports.incomeStatement(r.from, r.to) as Promise<IncomeStmt>
  });
  return (
    <>
      <RangeBar r={r} onRun={() => refetch()} />
      {data && (
        <Card>
          <h3 className="font-semibold mb-2">{i18n.language === 'ar' ? 'الإيرادات' : 'Revenue'}</h3>
          <table className="w-full text-sm mb-4">
            <tbody>
              {data.lines.filter(l => l.type === 'revenue').map((l, i) => (
                <tr key={i} className="border-t border-line"><td className="py-1.5 ltr-num w-24">{l.code}</td><td>{l.name}</td><td className="text-end ltr-num">{formatMoney(l.amountMinor)}</td></tr>
              ))}
              <tr className="border-t-2 border-line font-semibold"><td colSpan={2} className="py-2">{t('total')}</td><td className="text-end ltr-num">{formatMoney(data.totalRevenueMinor)}</td></tr>
            </tbody>
          </table>
          <h3 className="font-semibold mb-2">{i18n.language === 'ar' ? 'المصروفات' : 'Expenses'}</h3>
          <table className="w-full text-sm mb-4">
            <tbody>
              {data.lines.filter(l => l.type === 'expense').map((l, i) => (
                <tr key={i} className="border-t border-line"><td className="py-1.5 ltr-num w-24">{l.code}</td><td>{l.name}</td><td className="text-end ltr-num">{formatMoney(l.amountMinor)}</td></tr>
              ))}
              <tr className="border-t-2 border-line font-semibold"><td colSpan={2} className="py-2">{t('total')}</td><td className="text-end ltr-num">{formatMoney(data.totalExpenseMinor)}</td></tr>
            </tbody>
          </table>
          <div className="text-lg font-bold text-accent">
            {i18n.language === 'ar' ? 'صافي الدخل' : 'Net income'}: <span className="ltr-num">{formatMoney(data.netIncomeMinor)}</span>
          </div>
        </Card>
      )}
    </>
  );
};

interface BalSheet { lines: Array<{ code: string; name: string; type: string; amountMinor: string }>; totalAssetsMinor: string; totalLiabilitiesMinor: string; totalEquityMinor: string; netIncomeMinor: string; }

const BalanceSheet: React.FC = () => {
  const { t, i18n } = useTranslation();
  const [asOf, setAsOf] = useState(today());
  const { data, refetch } = useQuery<BalSheet>({
    queryKey: ['bs', asOf],
    queryFn: () => api.reports.balanceSheet(asOf) as Promise<BalSheet>
  });
  const section = (typ: string, title: string, totalLabel: string, totalVal: string) => (
    <div className="mb-4">
      <h3 className="font-semibold mb-2">{title}</h3>
      <table className="w-full text-sm">
        <tbody>
          {data?.lines.filter(l => l.type === typ).map((l, i) => (
            <tr key={i} className="border-t border-line"><td className="py-1.5 ltr-num w-24">{l.code}</td><td>{l.name}</td><td className="text-end ltr-num">{formatMoney(l.amountMinor)}</td></tr>
          ))}
          <tr className="border-t-2 border-line font-semibold"><td colSpan={2} className="py-2">{totalLabel}</td><td className="text-end ltr-num">{formatMoney(totalVal)}</td></tr>
        </tbody>
      </table>
    </div>
  );
  return (
    <>
      <div className="flex gap-2 items-end mb-3">
        <div><Label>{t('to')}</Label><Input className="ltr-num" type="date" value={asOf} onChange={e => setAsOf(e.target.value)} /></div>
        <Btn onClick={() => refetch()}>{t('search')}</Btn>
      </div>
      {data && (
        <Card>
          {section('asset', i18n.language === 'ar' ? 'الأصول' : 'Assets', t('total'), data.totalAssetsMinor)}
          {section('liability', i18n.language === 'ar' ? 'الخصوم' : 'Liabilities', t('total'), data.totalLiabilitiesMinor)}
          {section('equity', i18n.language === 'ar' ? 'حقوق الملكية' : 'Equity', t('total'), data.totalEquityMinor)}
          <div className="text-sm text-fg2">+ {i18n.language === 'ar' ? 'صافي الدخل' : 'Net income'}: <span className="ltr-num">{formatMoney(data.netIncomeMinor)}</span></div>
        </Card>
      )}
    </>
  );
};

interface ReorderRow { id: number; code: string; name: string; onHand: number; minQty: number; reorderQty: number; maxQty: number }

interface BudgetReportRow {
  accountId: number; accountCode: string; accountName: string; accountType: string;
  budgetMinor: string | number; actualMinor: string | number; varianceMinor: string | number;
}

const BudgetVsActual: React.FC = () => {
  const { t } = useTranslation();
  const r = useRange();
  const { data = [], refetch } = useQuery<BudgetReportRow[]>({
    queryKey: ['budget-report', r.from, r.to],
    queryFn: () => api.budgets.report(r.from, r.to) as Promise<BudgetReportRow[]>
  });
  return (
    <>
      <RangeBar r={r} onRun={() => refetch()} />
      <ExportPrintBar
        filename={`budget-vs-actual-${r.from}_${r.to}`}
        title={`Budget vs actual ${r.from} → ${r.to}`}
        rows={data}
        cols={[
          { header: t('account'), value: x => `${x.accountCode} ${x.accountName}` },
          { header: t('budget'), value: x => formatMoney(String(x.budgetMinor)) },
          { header: t('actual'), value: x => formatMoney(String(x.actualMinor)) },
          { header: t('variance'), value: x => formatMoney(String(x.varianceMinor)) }
        ]}
      />
      <Table<BudgetReportRow>
        rows={data}
        cols={[
          { key: 'accountCode', header: t('account'), className: 'ltr-num w-32', render: x => `${x.accountCode} — ${x.accountName}` },
          { key: 'budgetMinor', header: t('budget'), className: 'ltr-num text-end', render: x => formatMoney(String(x.budgetMinor)) },
          { key: 'actualMinor', header: t('actual'), className: 'ltr-num text-end', render: x => formatMoney(String(x.actualMinor)) },
          { key: 'varianceMinor', header: t('variance'), className: 'ltr-num text-end', render: x => formatMoney(String(x.varianceMinor)) }
        ]}
      />
    </>
  );
};

const ReorderAlert: React.FC = () => {
  const { t } = useTranslation();
  const { data = [] } = useQuery<ReorderRow[]>({ queryKey: ['reorder-alert'], queryFn: () => api.extraReports.reorderAlert() as Promise<ReorderRow[]> });
  return (
    <>
      <ExportPrintBar
        filename="reorder-alert"
        title="Reorder alert"
        rows={data}
        cols={[
          { header: t('code'), value: x => x.code },
          { header: t('name'), value: x => x.name },
          { header: t('qty'), value: x => x.onHand },
          { header: t('reorderLevel'), value: x => x.reorderQty }
        ]}
      />
      <Table<ReorderRow>
        rows={data}
        cols={[
          { key: 'code', header: t('code'), className: 'ltr-num w-24' },
          { key: 'name', header: t('name') },
          { key: 'onHand', header: t('qty'), className: 'ltr-num text-end' },
          { key: 'reorderQty', header: t('reorderLevel'), className: 'ltr-num text-end' }
        ]}
      />
    </>
  );
};

interface CashboxBal { id: number; name: string; currency: string; balanceMinor: string }
interface ChequeBucket { status: string; currency: string; n: number; amountMinor: string }
interface LiquidityData { cashboxes: CashboxBal[]; inflows: ChequeBucket[]; outflows: ChequeBucket[] }

const BankLiquidity: React.FC = () => {
  const { t } = useTranslation();
  const { data } = useQuery<LiquidityData>({ queryKey: ['bank-liquidity'], queryFn: () => api.extraReports.bankLiquidity() as Promise<LiquidityData> });
  if (!data) return <div>{t('loading')}</div>;
  return (
    <>
      <Card className="mb-3">
        <h3 className="font-semibold mb-2">{t('cashbox')}</h3>
        <Table<CashboxBal>
          rows={data.cashboxes}
          cols={[
            { key: 'name', header: t('name') },
            { key: 'currency', header: t('currency'), className: 'w-20' },
            { key: 'balanceMinor', header: t('balance'), className: 'ltr-num text-end',
              render: x => formatMoney(String(x.balanceMinor), x.currency) }
          ]}
        />
      </Card>
      <Card className="mb-3">
        <h3 className="font-semibold mb-2">{t('chequesIn')}</h3>
        <Table<ChequeBucket>
          rows={data.inflows}
          cols={[
            { key: 'status', header: t('status'), render: x => t(x.status) },
            { key: 'currency', header: t('currency'), className: 'w-20' },
            { key: 'n', header: t('count'), className: 'ltr-num text-end' },
            { key: 'amountMinor', header: t('total'), className: 'ltr-num text-end',
              render: x => formatMoney(String(x.amountMinor), x.currency) }
          ]}
        />
      </Card>
      <Card>
        <h3 className="font-semibold mb-2">{t('chequesOut')}</h3>
        <Table<ChequeBucket>
          rows={data.outflows}
          cols={[
            { key: 'status', header: t('status'), render: x => t(x.status) },
            { key: 'currency', header: t('currency'), className: 'w-20' },
            { key: 'n', header: t('count'), className: 'ltr-num text-end' },
            { key: 'amountMinor', header: t('total'), className: 'ltr-num text-end',
              render: x => formatMoney(String(x.amountMinor), x.currency) }
          ]}
        />
      </Card>
    </>
  );
};

export default function ReportsPage(): JSX.Element {
  const tn = useTranslation('nav').t;
  return (
    <Page title={tn('reports')}>
      <SubNav />
      <Routes>
        <Route index element={<TrialBalance />} />
        <Route path="ledger" element={<Ledger />} />
        <Route path="party" element={<PartyStatement />} />
        <Route path="inventory" element={<InventoryBalance />} />
        <Route path="movement" element={<InventoryMovement />} />
        <Route path="sales" element={<SummaryReport which="sales" />} />
        <Route path="purchases" element={<SummaryReport which="purchases" />} />
        <Route path="ar" element={<Aging which="ar" />} />
        <Route path="ap" element={<Aging which="ap" />} />
        <Route path="income" element={<IncomeStatement />} />
        <Route path="balance" element={<BalanceSheet />} />
        <Route path="budget" element={<BudgetVsActual />} />
        <Route path="reorder" element={<ReorderAlert />} />
        <Route path="liquidity" element={<BankLiquidity />} />
      </Routes>
    </Page>
  );
}
