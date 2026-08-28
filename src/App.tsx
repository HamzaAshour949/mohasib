import { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { setLanguage } from './lib/i18n';
import { api } from './lib/ipc';
import { runViewAction } from './lib/view-actions';
import { confirmDiscard } from './lib/dirty';
import type { MenuMessage } from '@shared/ipc-channels';

// Every route was imported eagerly into a single 756 kB startup chunk, so
// opening the dashboard downloaded and parsed the reports module, the
// manufacturing module and 26 others before it could paint. Lazy imports let
// Rollup emit one chunk per route and the app loads what it shows.
const Dashboard = lazy(() => import('./routes/Dashboard'));
const AccountsPage = lazy(() => import('./routes/Accounts'));
const PartiesPage = lazy(() => import('./routes/Parties'));
const ItemsPage = lazy(() => import('./routes/Items'));
const WarehousesPage = lazy(() => import('./routes/Warehouses'));
const CashboxesPage = lazy(() => import('./routes/Cashboxes'));
const InvoicesPage = lazy(() => import('./routes/Invoices'));
const VouchersPage = lazy(() => import('./routes/Vouchers'));
const ChequesPage = lazy(() => import('./routes/Cheques'));
const JournalPage = lazy(() => import('./routes/Journal'));
const ReportsPage = lazy(() => import('./routes/Reports'));
const SettingsPage = lazy(() => import('./routes/Settings'));
const DepartmentsPage = lazy(() => import('./routes/Departments'));
const ProjectsPage = lazy(() => import('./routes/Projects'));
const FundersPage = lazy(() => import('./routes/Funders'));
const CurrenciesPage = lazy(() => import('./routes/Currencies'));
const StockMovementsPage = lazy(() => import('./routes/StockMovements'));
const QuotesPage = lazy(() => import('./routes/Quotes'));
const OrdersPage = lazy(() => import('./routes/Orders'));
const ExpensesPage = lazy(() => import('./routes/Expenses'));
const EmployeesPage = lazy(() => import('./routes/Employees'));
const PayrollPage = lazy(() => import('./routes/Payroll'));
const AssetsPage = lazy(() => import('./routes/Assets'));
const AuditReportPage = lazy(() => import('./routes/AuditReport'));
const BanksPage = lazy(() => import('./routes/Banks'));
const NotesPage = lazy(() => import('./routes/Notes'));
const MultiVouchersPage = lazy(() => import('./routes/MultiVouchers'));
const ManufacturingPage = lazy(() => import('./routes/Manufacturing'));
const BudgetsPage = lazy(() => import('./routes/Budgets'));

const NAV: Array<{ to: string; key: string }> = [
  { to: '/', key: 'dashboard' },
  { to: '/accounts', key: 'accounts' },
  { to: '/parties', key: 'parties' },
  { to: '/items', key: 'items' },
  { to: '/warehouses', key: 'warehouses' },
  { to: '/cashboxes', key: 'cashboxes' },
  { to: '/invoices', key: 'invoices' },
  { to: '/quotes', key: 'quotes' },
  { to: '/orders', key: 'orders' },
  { to: '/vouchers', key: 'vouchers' },
  { to: '/multi-vouchers', key: 'multiVouchers' },
  { to: '/notes', key: 'notes' },
  { to: '/expenses', key: 'expenses' },
  { to: '/cheques', key: 'cheques' },
  { to: '/banks', key: 'banks' },
  { to: '/stock-movements', key: 'stockMovements' },
  { to: '/manufacturing', key: 'manufacturing' },
  { to: '/journal', key: 'journal' },
  { to: '/employees', key: 'employees' },
  { to: '/payroll', key: 'payroll' },
  { to: '/assets', key: 'assets' },
  { to: '/departments', key: 'departments' },
  { to: '/projects', key: 'projects' },
  { to: '/funders', key: 'funders' },
  { to: '/budgets', key: 'budgets' },
  { to: '/currencies', key: 'currencies' },
  { to: '/reports', key: 'reports' },
  { to: '/audit', key: 'audit' },
  { to: '/settings', key: 'settings' }
];

const Sidebar: React.FC = () => {
  const { t, i18n } = useTranslation('nav');
  const dir = i18n.language === 'ar' ? 'border-l' : 'border-r';
  return (
    <aside className={`w-56 shrink-0 bg-panel ${dir} border-line flex flex-col`}>
      <Link to="/" className="px-4 py-4 text-lg font-bold text-accent">
        {i18n.language === 'ar' ? 'محاسب' : 'Mohasib'}
      </Link>
      <nav className="flex-1 overflow-y-auto px-2 py-2 space-y-1">
        {NAV.map(n => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.to === '/'}
            className={({ isActive }) =>
              `block rounded-md px-3 py-2 text-sm transition ${
                isActive ? 'bg-accent text-bg font-semibold' : 'text-fg2 hover:bg-bg2 hover:text-fg'
              }`
            }
          >
            {t(n.key)}
          </NavLink>
        ))}
      </nav>
      <div className="px-3 py-3 border-t border-line text-xs text-fg2">
        <div className="flex items-center justify-between">
          <span>{i18n.language === 'ar' ? 'بدون ربا · بدون ضرائب' : 'No interest · No taxes'}</span>
        </div>
      </div>
    </aside>
  );
};

const SEG_TO_NAV: Record<string, string> = {
  'stock-movements': 'stockMovements',
  'multi-vouchers': 'multiVouchers'
};

const Header: React.FC = () => {
  const { t, i18n } = useTranslation();
  const loc = useLocation();
  const navT = useTranslation('nav').t;
  const seg = loc.pathname.split('/')[1] || 'dashboard';
  const navKey = SEG_TO_NAV[seg] ?? seg;
  return (
    <header className="h-12 border-b border-line bg-panel flex items-center px-4 gap-3">
      <h1 className="font-semibold text-fg">{navT(navKey)}</h1>
      <div className="flex-1" />
      <select
        value={i18n.language}
        onChange={(e) => setLanguage(e.target.value as 'ar' | 'en')}
        className="bg-bg2 border border-line text-sm rounded-md px-2 py-1"
      >
        <option value="ar">{t('arabic')}</option>
        <option value="en">{t('english')}</option>
      </select>
    </header>
  );
};

export default function App(): JSX.Element {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [groupNotes, setGroupNotes] = useState<string>('');

  const onMenu = useCallback(async (message: MenuMessage): Promise<void> => {
    switch (message.action) {
      case 'backup': {
        const r = await api.backup.save() as { ok: boolean; error?: string; path?: string };
        if (r.ok) alert(`${t('backupDone')}: ${r.path ?? ''}`);
        else if (r.error !== 'cancelled') alert(r.error ?? t('error'));
        return;
      }
      case 'restore': {
        const r = await api.backup.restore() as { ok: boolean; error?: string };
        if (r.ok) {
          // The main process reopened the replaced file, so every cached row
          // on screen now belongs to a database that no longer exists.
          await queryClient.invalidateQueries();
          alert(t('restoreDone'));
        } else if (r.error !== 'cancelled') alert(r.error ?? t('error'));
        return;
      }
      case 'export':
        if (!runViewAction('onExport')) alert(t('nothingToExport'));
        return;
      case 'print':
        // Pages that render a report supply their own formatted print output;
        // anything else falls back to printing the window as it stands.
        if (!runViewAction('onPrint')) window.print();
        return;
      case 'navigate':
        if (!message.route) return;
        // Leaving the page discards whatever the open editor holds.
        if (!(await confirmDiscard())) return;
        navigate(message.route);
        return;
      case 'set-language':
        if (message.language) setLanguage(message.language);
        return;
    }
  }, [navigate, queryClient, t]);

  useEffect(() => {
    const off = api.app.onMenu((message) => { void onMenu(message); });
    // Only now is the renderer actually listening: menu actions fired before
    // this point were queued in the main process and arrive on this call.
    void api.app.ready();
    return off;
  }, [onMenu]);

  // Keep the native menu's language and its radio state in step with the UI.
  useEffect(() => {
    void api.app.setLanguage(i18n.language === 'en' ? 'en' : 'ar');
  }, [i18n.language]);

  useEffect(() => {
    // Show group notes once per session
    if (sessionStorage.getItem('mohasib.groupNotesShown')) return;
    void (async () => {
      try {
        const s = await api.settings.get() as { groupNotes?: string };
        if (s.groupNotes && s.groupNotes.trim()) {
          setGroupNotes(s.groupNotes);
          sessionStorage.setItem('mohasib.groupNotesShown', '1');
        }
      } catch { /* ignore */ }
    })();
  }, []);

  return (
    <div className="h-screen flex bg-bg text-fg">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-auto">
          <Suspense fallback={<div className="p-6 text-fg2 text-sm">{t('loading')}</div>}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/accounts" element={<AccountsPage />} />
            <Route path="/parties" element={<PartiesPage />} />
            <Route path="/items" element={<ItemsPage />} />
            <Route path="/warehouses" element={<WarehousesPage />} />
            <Route path="/cashboxes" element={<CashboxesPage />} />
            <Route path="/invoices" element={<InvoicesPage />} />
            <Route path="/quotes" element={<QuotesPage />} />
            <Route path="/orders" element={<OrdersPage />} />
            <Route path="/vouchers" element={<VouchersPage />} />
            <Route path="/multi-vouchers" element={<MultiVouchersPage />} />
            <Route path="/notes" element={<NotesPage />} />
            <Route path="/expenses" element={<ExpensesPage />} />
            <Route path="/cheques" element={<ChequesPage />} />
            <Route path="/banks" element={<BanksPage />} />
            <Route path="/stock-movements" element={<StockMovementsPage />} />
            <Route path="/manufacturing" element={<ManufacturingPage />} />
            <Route path="/journal" element={<JournalPage />} />
            <Route path="/employees" element={<EmployeesPage />} />
            <Route path="/payroll" element={<PayrollPage />} />
            <Route path="/assets" element={<AssetsPage />} />
            <Route path="/departments" element={<DepartmentsPage />} />
            <Route path="/projects" element={<ProjectsPage />} />
            <Route path="/funders" element={<FundersPage />} />
            <Route path="/budgets" element={<BudgetsPage />} />
            <Route path="/currencies" element={<CurrenciesPage />} />
            <Route path="/reports/*" element={<ReportsPage />} />
            <Route path="/audit" element={<AuditReportPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
          </Suspense>
        </main>
      </div>
      {groupNotes && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setGroupNotes('')}>
          <div className="bg-panel border border-line rounded-lg shadow-xl w-[520px] max-h-[80vh] overflow-auto p-5" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-semibold mb-3">{t('groupNotes')}</h2>
            <pre className="text-sm whitespace-pre-wrap text-fg2 mb-4">{groupNotes}</pre>
            <div className="text-end">
              <button className="bg-accent text-bg rounded-md px-4 py-1.5 text-sm font-semibold" onClick={() => setGroupNotes('')}>{t('ok')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
