import { app, BrowserWindow, Menu, shell } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openCompany, closeDb } from './services/db';
import { runMigrations } from './services/migrations';
import { registerAccounts, registerSettings } from './ipc/accounts';
import { registerParties } from './ipc/parties';
import { registerItems, registerWarehouses, registerCashboxes } from './ipc/inventory';
import { registerInvoices } from './ipc/invoices';
import { registerVouchers } from './ipc/vouchers';
import { registerCheques } from './ipc/cheques';
import { registerJournal } from './ipc/journal';
import { registerReports } from './ipc/reports';
import {
  registerDepartments, registerProjects, registerFunders, registerExpenseCategories,
  registerCurrencies, registerStockMovements, registerQuotes, registerOrders,
  registerExpenseVouchers, registerEmployees, registerPayroll, registerAssets,
  registerPeriodLocks, registerBackup, registerAuditReports, registerRollover,
  registerDocConversions, registerBanks, registerNotes, registerMultiVouchers, registerExtraReports,
  registerManufacturing, registerBudgets
} from './ipc/v2';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let mainWindow: BrowserWindow | null = null;

const createWindow = (): void => {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    title: 'Mohasib',
    backgroundColor: '#0F1115',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }
};

const buildMenu = (): void => {
  const isMac = process.platform === 'darwin';
  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac ? [{ role: 'appMenu' as const }] : []),
    {
      label: 'File',
      submenu: [
        {
          label: 'Print…',
          accelerator: 'CmdOrCtrl+P',
          click: () => mainWindow?.webContents.print({ silent: false, printBackground: true })
        },
        { type: 'separator' },
        {
          label: 'Backup database…',
          click: () => mainWindow?.webContents.send('menu:backup')
        },
        {
          label: 'Restore database…',
          click: () => mainWindow?.webContents.send('menu:restore')
        },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' }
      ]
    },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
    {
      role: 'help',
      submenu: [
        {
          label: 'About Mohasib',
          click: (): void => {
            mainWindow?.webContents.send('app:show-about');
          }
        }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
};

void app.whenReady().then(() => {
  const dbInstance = openCompany();
  runMigrations(dbInstance);

  registerAccounts();
  registerSettings();
  registerParties();
  registerItems();
  registerWarehouses();
  registerCashboxes();
  registerInvoices();
  registerVouchers();
  registerCheques();
  registerJournal();
  registerReports();

  registerDepartments();
  registerProjects();
  registerFunders();
  registerExpenseCategories();
  registerCurrencies();
  registerStockMovements();
  registerQuotes();
  registerOrders();
  registerExpenseVouchers();
  registerEmployees();
  registerPayroll();
  registerAssets();
  registerPeriodLocks();
  registerBackup();
  registerAuditReports();
  registerRollover();
  registerDocConversions();
  registerBanks();
  registerNotes();
  registerMultiVouchers();
  registerExtraReports();
  registerManufacturing();
  registerBudgets();

  buildMenu();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  closeDb();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  closeDb();
});
