// Stand-in for the `electron` module so the IPC handlers can be tested as the
// renderer actually calls them.
//
// The point is to test the shipped code path. scripts/e2e-test.ts used to
// re-implement posting and stock movement by hand and assert on its own
// arithmetic, which meant it agreed with itself no matter what the app did —
// it passed while the weighted-average cost calculation was returning the
// wrong number on every receipt.

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

type Handler = (event: unknown, ...args: unknown[]) => unknown;

const handlers = new Map<string, Handler>();
let userDataDir = mkdtempSync(join(tmpdir(), 'mohasib-test-'));

export const ipcMain = {
  handle(channel: string, handler: Handler): void { handlers.set(channel, handler); },
  removeHandler(channel: string): void { handlers.delete(channel); }
};

export const app = {
  getPath: (): string => userDataDir,
  getVersion: (): string => '0.0.0-test',
  whenReady: (): Promise<void> => Promise.resolve(),
  on(): void { /* no lifecycle in tests */ },
  quit(): void { /* no lifecycle in tests */ },
  requestSingleInstanceLock: (): boolean => true
};

export const BrowserWindow = {
  getFocusedWindow: (): null => null,
  getAllWindows: (): unknown[] => []
};

export const dialog = {
  showSaveDialog: (): Promise<{ canceled: boolean }> => Promise.resolve({ canceled: true }),
  showOpenDialog: (): Promise<{ canceled: boolean; filePaths: string[] }> => Promise.resolve({ canceled: true, filePaths: [] }),
  showMessageBox: (): Promise<{ response: number }> => Promise.resolve({ response: 0 })
};

export const shell = { openExternal: (): Promise<void> => Promise.resolve() };
export const session = { defaultSession: { setPermissionRequestHandler(): void {}, setPermissionCheckHandler(): void {} } };
export const Menu = { setApplicationMenu(): void {}, buildFromTemplate: (t: unknown): unknown => t };
export const contextBridge = { exposeInMainWorld(): void {} };
export const ipcRenderer = { invoke: (): Promise<void> => Promise.resolve(), on(): void {}, off(): void {} };

// --- test helpers -----------------------------------------------------------

/** Call a registered IPC handler the way the preload bridge would. */
export const invokeIpc = async <T>(channel: string, ...args: unknown[]): Promise<T> => {
  const handler = handlers.get(channel);
  if (!handler) throw new Error(`No IPC handler registered for '${channel}'`);
  return await handler({}, ...args) as T;
};

export const setUserDataDir = (dir: string): void => { userDataDir = dir; };
/** Every channel the main process has registered a handler for. */
export const registeredChannels = (): string[] => [...handlers.keys()];
export const resetIpc = (): void => { handlers.clear(); };

export default { app, ipcMain, BrowserWindow, dialog, shell, session, Menu, contextBridge, ipcRenderer };
