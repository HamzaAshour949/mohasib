import { app, BrowserWindow, dialog, ipcMain, session, shell } from 'electron';
import path from 'node:path';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { openCompany, closeDb, db as database } from './services/db';
import { runMigrations } from './services/migrations';
import { buildMenu } from './menu';
import { S, setMainLanguage } from './strings';
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
import {
  ABOUT_CHANNEL, CONFIRM_DISCARD_CHANNEL, DIRTY_CHANNEL, LANGUAGE_CHANNEL,
  MENU_CHANNEL, READY_CHANNEL, SAVE_TEXT_FILE_CHANNEL,
  type AppLanguage, type MenuMessage, type SaveTextFileRequest, type SaveTextFileResult
} from '@shared/ipc-channels';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rendererDir = path.join(__dirname, '../renderer');
const rendererEntry = path.join(rendererDir, 'index.html');
const devServerUrl = process.env.ELECTRON_RENDERER_URL;

let mainWindow: BrowserWindow | null = null;
let language: AppLanguage = 'ar';

/** The renderer has unsaved edits in an open editor. Set from the renderer. */
let documentDirty = false;
/** Set once the user has confirmed discarding, so the retried close goes through. */
let closeConfirmed = false;

// ---------------------------------------------------------------------------
// Menu → renderer messages
//
// A menu item can fire before React has mounted and subscribed — the window
// finishes loading well before the tree is live — and a message pushed into
// that gap is simply lost. Queue until the renderer says it is listening, then
// flush; after that, push directly.
// ---------------------------------------------------------------------------
let rendererReady = false;
const pending: MenuMessage[] = [];

const sendToRenderer = (message: MenuMessage): void => {
  if (rendererReady && mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(MENU_CHANNEL, message);
  } else {
    pending.push(message);
  }
};

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

/** Only ever hand the OS a web or mail URL — never a file path or a custom scheme. */
const openExternal = (rawUrl: string): void => {
  let parsed: URL;
  try { parsed = new URL(rawUrl); } catch { return; }
  if (parsed.protocol === 'https:' || parsed.protocol === 'http:' || parsed.protocol === 'mailto:') {
    void shell.openExternal(parsed.href);
  }
};

/** True for the app's own renderer: the dev server in dev, files under out/renderer in production. */
const isInternalUrl = (rawUrl: string): boolean => {
  if (devServerUrl && rawUrl.startsWith(devServerUrl)) return true;
  if (!rawUrl.startsWith('file://')) return false;
  try {
    const target = path.resolve(fileURLToPath(rawUrl));
    return target === path.resolve(rendererEntry) || target.startsWith(path.resolve(rendererDir) + path.sep);
  } catch {
    return false;
  }
};

const applyContentsGuards = (contents: Electron.WebContents): void => {
  // In-page navigation away from the app (a stray link, a redirect) leaves the
  // renderer running privileged remote content. Send it to the browser instead.
  contents.on('will-navigate', (event, url) => {
    if (isInternalUrl(url)) return;
    event.preventDefault();
    openExternal(url);
  });
  contents.setWindowOpenHandler(({ url }) => {
    openExternal(url);
    return { action: 'deny' };
  });
  contents.on('will-attach-webview', (event) => event.preventDefault());
};

// ---------------------------------------------------------------------------
// Window
// ---------------------------------------------------------------------------

const confirmDiscard = async (window: BrowserWindow): Promise<boolean> => {
  const s = S();
  const { response } = await dialog.showMessageBox(window, {
    type: 'warning',
    buttons: [s.cancel, s.discardChanges],
    defaultId: 0,
    cancelId: 0,
    message: s.unsavedTitle,
    detail: s.unsavedDetail
  });
  return response === 1;
};

const createWindow = (): void => {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    title: 'Mohasib',
    backgroundColor: '#0F1115',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInSubFrames: false,
      nodeIntegrationInWorker: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,
      spellcheck: false
    }
  });

  applyContentsGuards(mainWindow.webContents);

  mainWindow.once('ready-to-show', () => mainWindow?.show());

  mainWindow.on('close', (event) => {
    const window = mainWindow;
    if (!window || closeConfirmed || !documentDirty) return;
    event.preventDefault();
    void confirmDiscard(window).then((discard) => {
      if (!discard) return;
      closeConfirmed = true;
      documentDirty = false;
      window.close();
    });
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    rendererReady = false;
    pending.length = 0;
  });

  // A reload throws away the renderer's subscriptions, so anything sent before
  // it mounts again would be lost the same way it is at startup.
  mainWindow.webContents.on('did-start-navigation', (_e, _url, _isInPlace, isMainFrame) => {
    if (isMainFrame) rendererReady = false;
  });

  if (devServerUrl) void mainWindow.loadURL(devServerUrl);
  else void mainWindow.loadFile(rendererEntry);
};

const focusWindow = (): void => {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
};

// ---------------------------------------------------------------------------
// Shell-level IPC
// ---------------------------------------------------------------------------

const registerShellIpc = (): void => {
  ipcMain.handle(READY_CHANNEL, () => {
    rendererReady = true;
    const queued = pending.splice(0, pending.length);
    for (const message of queued) mainWindow?.webContents.send(MENU_CHANNEL, message);
    return { ok: true };
  });

  ipcMain.handle(DIRTY_CHANNEL, (_e, dirty: unknown) => {
    documentDirty = dirty === true;
    if (!documentDirty) closeConfirmed = false;
    return { ok: true };
  });

  ipcMain.handle(LANGUAGE_CHANNEL, (_e, next: unknown) => {
    const lng: AppLanguage = next === 'en' ? 'en' : 'ar';
    if (lng === language) return { ok: true };
    language = lng;
    installMenu();
    // Persist so the menu comes up in the right language next launch, before
    // the renderer has had a chance to report anything.
    try {
      database()
        .prepare(`INSERT INTO settings(key, value) VALUES ('language', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`)
        .run(lng);
    } catch { /* settings persistence is not worth failing a menu click over */ }
    return { ok: true };
  });

  // Used by every renderer path that replaces the open document — new, switch,
  // discard — not just by the window close guard.
  ipcMain.handle(CONFIRM_DISCARD_CHANNEL, async () => {
    if (!documentDirty || !mainWindow) return { discard: true };
    return { discard: await confirmDiscard(mainWindow) };
  });

  ipcMain.handle(ABOUT_CHANNEL, () => ({
    version: app.getVersion(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node
  }));

  // The renderer has no filesystem access. Exports go through a real save
  // dialog here instead of a blob download the user cannot see or place.
  ipcMain.handle(SAVE_TEXT_FILE_CHANNEL, async (_e, request: SaveTextFileRequest): Promise<SaveTextFileResult> => {
    if (!mainWindow) return { ok: false, error: 'no window' };
    if (typeof request?.contents !== 'string') return { ok: false, error: 'invalid payload' };
    // Never let a renderer-supplied name steer the dialog out of its directory.
    const suggested = path.basename(String(request.suggestedName || 'export.csv'));
    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath: suggested,
      filters: request.filter ? [request.filter] : undefined
    });
    if (result.canceled || !result.filePath) return { ok: false, error: 'cancelled' };
    try {
      // BOM so Excel detects UTF-8; matches what the old blob download wrote.
      await writeFile(result.filePath, '﻿' + request.contents, 'utf8');
      return { ok: true, path: result.filePath };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  });
};

const installMenu = (): void => {
  buildMenu(language, {
    getWindow: () => mainWindow,
    send: sendToRenderer,
    setLanguage: (lng) => {
      language = lng;
      installMenu();
      sendToRenderer({ action: 'set-language', language: lng });
    }
  });
};

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

// Two instances on the same SQLite file is a data-integrity question nobody
// wants to answer. Hand the argument to the running one and exit.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', focusWindow);

  void app.whenReady().then(() => {
    const opened = openCompany();
    runMigrations(opened);

    const stored = opened.prepare(`SELECT value FROM settings WHERE key='language'`).get() as { value?: string } | undefined;
    language = stored?.value === 'en' ? 'en' : 'ar';
    setMainLanguage(language);

    // Nothing in this app needs camera, microphone, location or notifications.
    session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    session.defaultSession.setPermissionCheckHandler(() => false);

    registerShellIpc();
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

    installMenu();
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
      else focusWindow();
    });
  });
}

// Guards every WebContents, including frames the print helper creates.
app.on('web-contents-created', (_event, contents) => applyContentsGuards(contents));

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Closing the database is the last thing that should happen: doing it in
// window-all-closed left macOS with a live app and no database, so the next
// activate threw on every IPC call.
app.on('before-quit', () => {
  closeDb();
});
