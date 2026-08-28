import { contextBridge, ipcRenderer } from 'electron';
import {
  ABOUT_CHANNEL, CONFIRM_DISCARD_CHANNEL, DIRTY_CHANNEL, LANGUAGE_CHANNEL,
  MENU_CHANNEL, READY_CHANNEL, SAVE_TEXT_FILE_CHANNEL,
  type AppLanguage, type MenuMessage, type SaveTextFileRequest, type SaveTextFileResult
} from '@shared/ipc-channels';

const invoke = <T>(channel: string, ...args: unknown[]): Promise<T> =>
  ipcRenderer.invoke(channel, ...args) as Promise<T>;

const api = {
  accounts: {
    list: () => invoke('accounts:list'),
    tree: () => invoke('accounts:tree'),
    byType: (type: string) => invoke('accounts:byType', type),
    save: (a: unknown) => invoke('accounts:save', a),
    delete: (id: number) => invoke('accounts:delete', id)
  },
  settings: {
    get: () => invoke('settings:get'),
    save: (s: unknown) => invoke('settings:save', s),
    checkText: (t: string) => invoke('settings:checkText', t)
  },
  parties: {
    list: (kind?: string) => invoke('parties:list', kind),
    get: (id: number) => invoke('parties:get', id),
    save: (p: unknown) => invoke('parties:save', p),
    delete: (id: number) => invoke('parties:delete', id)
  },
  items: {
    list: () => invoke('items:list'),
    get: (id: number) => invoke('items:get', id),
    save: (i: unknown) => invoke('items:save', i),
    delete: (id: number) => invoke('items:delete', id),
    stock: () => invoke('items:stock')
  },
  warehouses: {
    list: () => invoke('warehouses:list'),
    save: (w: unknown) => invoke('warehouses:save', w),
    delete: (id: number) => invoke('warehouses:delete', id)
  },
  cashboxes: {
    list: () => invoke('cashboxes:list'),
    save: (c: unknown) => invoke('cashboxes:save', c),
    delete: (id: number) => invoke('cashboxes:delete', id)
  },
  invoices: {
    list: (kind?: string) => invoke('invoices:list', kind),
    get: (id: number) => invoke('invoices:get', id),
    save: (inv: unknown) => invoke('invoices:save', inv)
  },
  vouchers: {
    list: (kind?: string) => invoke('vouchers:list', kind),
    save: (v: unknown) => invoke('vouchers:save', v)
  },
  cheques: {
    list: (status?: string) => invoke('cheques:list', status),
    save: (c: unknown) => invoke('cheques:save', c),
    transition: (args: unknown) => invoke('cheques:transition', args)
  },
  journal: {
    list: (fromDate?: string, toDate?: string) => invoke('journal:list', fromDate, toDate),
    get: (id: number) => invoke('journal:get', id),
    save: (je: unknown) => invoke('journal:save', je),
    reverse: (args: unknown) => invoke('journal:reverse', args)
  },
  reports: {
    trialBalance: (f: string, t: string) => invoke('reports:trialBalance', f, t),
    accountLedger: (id: number, f: string, t: string) => invoke('reports:accountLedger', id, f, t),
    partyStatement: (id: number, f: string, t: string) => invoke('reports:partyStatement', id, f, t),
    inventoryBalance: () => invoke('reports:inventoryBalance'),
    inventoryMovement: (id: number, f: string, t: string) => invoke('reports:inventoryMovement', id, f, t),
    salesSummary: (f: string, t: string) => invoke('reports:salesSummary', f, t),
    purchasesSummary: (f: string, t: string) => invoke('reports:purchasesSummary', f, t),
    arAging: (asOf: string) => invoke('reports:arAging', asOf),
    apAging: (asOf: string) => invoke('reports:apAging', asOf),
    incomeStatement: (f: string, t: string) => invoke('reports:incomeStatement', f, t),
    balanceSheet: (asOf: string) => invoke('reports:balanceSheet', asOf),
    dashboard: () => invoke('reports:dashboard')
  },
  departments: {
    list: () => invoke('dept:list'),
    save: (d: unknown) => invoke('dept:save', d),
    delete: (id: number) => invoke('dept:delete', id)
  },
  projects: {
    list: () => invoke('proj:list'),
    save: (p: unknown) => invoke('proj:save', p),
    delete: (id: number) => invoke('proj:delete', id)
  },
  funders: {
    list: () => invoke('funder:list'),
    save: (f: unknown) => invoke('funder:save', f),
    delete: (id: number) => invoke('funder:delete', id)
  },
  expenseCategories: {
    list: () => invoke('expCat:list'),
    save: (c: unknown) => invoke('expCat:save', c),
    delete: (id: number) => invoke('expCat:delete', id)
  },
  currencies: {
    list: () => invoke('ccy:list'),
    save: (c: unknown) => invoke('ccy:save', c),
    delete: (code: string) => invoke('ccy:delete', code),
    fxList: (currency?: string) => invoke('fx:list', currency),
    fxSave: (r: unknown) => invoke('fx:save', r),
    fxDelete: (id: number) => invoke('fx:delete', id)
  },
  stockMovements: {
    list: () => invoke('sm:list'),
    get: (id: number) => invoke('sm:get', id),
    save: (m: unknown) => invoke('sm:save', m)
  },
  manufacturing: {
    formulasList: () => invoke('mfg:formulas:list'),
    formulaGet: (id: number) => invoke('mfg:formulas:get', id),
    formulaSave: (f: unknown) => invoke('mfg:formulas:save', f),
    formulaDelete: (id: number) => invoke('mfg:formulas:delete', id),
    runsList: () => invoke('mfg:runs:list'),
    runSave: (r: unknown) => invoke('mfg:runs:save', r)
  },
  budgets: {
    list: () => invoke('budget:list'),
    save: (b: unknown) => invoke('budget:save', b),
    delete: (id: number) => invoke('budget:delete', id),
    report: (from: string, to: string) => invoke('budget:report', from, to)
  },
  quotes: {
    list: (kind?: string) => invoke('quotes:list', kind),
    get: (id: number) => invoke('quotes:get', id),
    save: (q: unknown) => invoke('quotes:save', q),
    cancel: (id: number) => invoke('quotes:cancel', id)
  },
  orders: {
    list: (kind?: string) => invoke('orders:list', kind),
    get: (id: number) => invoke('orders:get', id),
    save: (o: unknown) => invoke('orders:save', o),
    cancel: (id: number) => invoke('orders:cancel', id)
  },
  expenses: {
    list: () => invoke('expense:list'),
    save: (x: unknown) => invoke('expense:save', x)
  },
  employees: {
    list: () => invoke('emp:list'),
    save: (e: unknown) => invoke('emp:save', e),
    delete: (id: number) => invoke('emp:delete', id)
  },
  payroll: {
    list: () => invoke('pay:list'),
    get: (id: number) => invoke('pay:get', id),
    save: (p: unknown) => invoke('pay:save', p)
  },
  assets: {
    list: () => invoke('asset:list'),
    save: (a: unknown) => invoke('asset:save', a),
    delete: (id: number) => invoke('asset:delete', id),
    depreciate: (args: unknown) => invoke('asset:depreciate', args),
    runs: (assetId: number) => invoke('asset:runs', assetId)
  },
  periodLocks: {
    list: () => invoke('lock:list'),
    save: (l: unknown) => invoke('lock:save', l),
    delete: (id: number) => invoke('lock:delete', id)
  },
  backup: {
    save: () => invoke('backup:save'),
    restore: () => invoke('backup:restore')
  },
  auditReports: {
    run: () => invoke('audit:run')
  },
  rollover: {
    run: (args: unknown) => invoke('rollover:run', args)
  },
  banks: {
    list: () => invoke('bank:list'),
    save: (b: unknown) => invoke('bank:save', b),
    delete: (id: number) => invoke('bank:delete', id)
  },
  notes: {
    list: (kind?: string) => invoke('note:list', kind),
    save: (n: unknown) => invoke('note:save', n)
  },
  multiVouchers: {
    list: (kind?: string) => invoke('mvouch:list', kind),
    get: (id: number) => invoke('mvouch:get', id),
    save: (v: unknown) => invoke('mvouch:save', v)
  },
  extraReports: {
    reorderAlert: () => invoke('reports:reorderAlert'),
    bankLiquidity: () => invoke('reports:bankLiquidity'),
    sourceDoc: (journalId: number) => invoke('reports:sourceDoc', journalId),
    stockOnHand: (itemId: number, warehouseId: number) => invoke('reports:stockOnHand', itemId, warehouseId)
  },
  docConvert: {
    quote: (args: unknown) => invoke('quotes:convert', args),
    order: (args: unknown) => invoke('orders:convert', args)
  },
  app: {
    /** Tell the main process the renderer is mounted; flushes queued menu messages. */
    ready: () => invoke<{ ok: boolean }>(READY_CHANNEL),
    /** Mirror the UI language into the native menu. */
    setLanguage: (lng: AppLanguage) => invoke<{ ok: boolean }>(LANGUAGE_CHANNEL, lng),
    /** Report whether an editor holds unsaved edits, so the close guard can act. */
    setDirty: (dirty: boolean) => invoke<{ ok: boolean }>(DIRTY_CHANNEL, dirty),
    /** Ask the native discard prompt; resolves true when it is safe to proceed. */
    confirmDiscard: () => invoke<{ discard: boolean }>(CONFIRM_DISCARD_CHANNEL),
    versions: () => invoke<{ version: string; electron: string; chrome: string; node: string }>(ABOUT_CHANNEL),
    /** Write text through a native save dialog — the renderer has no filesystem access. */
    saveTextFile: (request: SaveTextFileRequest) => invoke<SaveTextFileResult>(SAVE_TEXT_FILE_CHANNEL, request),
    /**
     * Subscribe to native-menu actions. Deliberately not a generic
     * `on(channel, handler)`: that let the renderer listen on any main-process
     * channel, and nothing needs that.
     */
    onMenu: (handler: (message: MenuMessage) => void): (() => void) => {
      const listener = (_e: unknown, message: MenuMessage): void => handler(message);
      ipcRenderer.on(MENU_CHANNEL, listener);
      return () => { ipcRenderer.off(MENU_CHANNEL, listener); };
    }
  }
};

contextBridge.exposeInMainWorld('api', api);
export type Api = typeof api;
