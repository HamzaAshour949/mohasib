import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/ipc';
import { formatMoney } from '../lib/money';
import { Card, Page } from '../components/ui';
import { gregorianToHijri } from '../lib/hijri';
import { useBaseCurrency } from '../lib/settings';

interface DashData {
  assetsMinor: string; liabilitiesMinor: string; equityMinor: string; netIncomeMinor: string;
  cashMinor: string; arMinor: string; apMinor: string; invoicesCount: number;
  lowStock: Array<{ code: string; name: string; qty: number; minQty: string }>;
}

const Tile: React.FC<{ label: string; value: string; sub?: string }> = ({ label, value, sub }) => (
  <Card>
    <div className="text-xs text-fg2">{label}</div>
    <div className="text-2xl font-semibold mt-1 ltr-num">{value}</div>
    {sub && <div className="text-xs text-fg2 mt-1">{sub}</div>}
  </Card>
);

export default function Dashboard(): JSX.Element {
  const { t, i18n } = useTranslation('nav');
  const tc = useTranslation().t;
  const { data, isLoading } = useQuery<DashData>({
    queryKey: ['dashboard'],
    queryFn: () => api.reports.dashboard() as Promise<DashData>
  });
  // Above the early return: every hook has to run on every render.
  const cur = useBaseCurrency();

  if (isLoading || !data) return <Page title={t('dashboard')}><div className="text-fg2">{tc('loading')}</div></Page>;
  const today = new Date();
  const dateLine = i18n.language === 'ar'
    ? `${today.toLocaleDateString('ar')} — ${gregorianToHijri(today)} ${tc('hijriSuffix')}`
    : today.toLocaleDateString(i18n.language);
  return (
    <Page title={`${t('dashboard')} · ${dateLine}`}>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Tile label={tc('cashOnHand')} value={formatMoney(data.cashMinor, cur)} />
        <Tile label={tc('receivable')} value={formatMoney(data.arMinor, cur)} />
        <Tile label={tc('payable')} value={formatMoney(data.apMinor, cur)} />
        <Tile label={tc('netIncome')} value={formatMoney(data.netIncomeMinor, cur)} />
        <Tile label={tc('totalAssets')} value={formatMoney(data.assetsMinor, cur)} />
        <Tile label={tc('totalLiabilities')} value={formatMoney(data.liabilitiesMinor, cur)} />
        <Tile label={tc('totalEquity')} value={formatMoney(data.equityMinor, cur)} />
        <Tile label={tc('invoicesCount')} value={String(data.invoicesCount)} />
      </div>
      <div className="mt-6">
        <h3 className="text-sm font-semibold mb-2">{tc('lowStockItems')}</h3>
        <Card>
          {data.lowStock.length === 0 ? (
            <div className="text-fg2 text-sm">{tc('noData')}</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-fg2 text-xs"><tr><th className="text-start py-1">{tc('code')}</th><th className="text-start">{tc('name')}</th><th className="text-end">{tc('qty')}</th><th className="text-end">{tc('minShort')}</th></tr></thead>
              <tbody>
                {data.lowStock.map((s, i) => (
                  <tr key={i} className="border-t border-line"><td className="py-1.5">{s.code}</td><td>{s.name}</td><td className="text-end ltr-num">{s.qty}</td><td className="text-end ltr-num">{s.minQty}</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
      <div className="mt-6 text-xs text-fg2">
        {tc('halalNote')}
      </div>
    </Page>
  );
}
