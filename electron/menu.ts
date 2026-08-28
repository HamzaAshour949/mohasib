import { app, Menu, dialog, type BrowserWindow, type MenuItemConstructorOptions } from 'electron';
import type { AppLanguage, MenuMessage } from '@shared/ipc-channels';
import { S, setMainLanguage, type MainStrings } from './strings';

export interface MenuDeps {
  getWindow: () => BrowserWindow | null;
  send: (message: MenuMessage) => void;
  setLanguage: (lng: AppLanguage) => void;
}

const showAbout = (window: BrowserWindow | null, s: MainStrings): void => {
  const detail = `${s.aboutDetail}\n\nElectron ${process.versions.electron} · Chromium ${process.versions.chrome} · Node ${process.versions.node}`;
  const options = { type: 'info' as const, title: s.about, message: `Mohasib ${app.getVersion()}`, detail, buttons: ['OK'] };
  if (window) void dialog.showMessageBox(window, options);
  else void dialog.showMessageBox(options);
};

export const buildMenu = (lang: AppLanguage, deps: MenuDeps): void => {
  setMainLanguage(lang);
  const s = S();
  const isMac = process.platform === 'darwin';
  const go = (route: string): void => deps.send({ action: 'navigate', route });

  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? [{
          label: 'Mohasib',
          submenu: [
            { label: s.about, click: () => showAbout(deps.getWindow(), s) },
            { type: 'separator' as const },
            { role: 'services' as const, label: s.services },
            { type: 'separator' as const },
            { role: 'hide' as const, label: s.hide },
            { role: 'hideOthers' as const, label: s.hideOthers },
            { role: 'unhide' as const, label: s.unhide },
            { type: 'separator' as const },
            { role: 'quit' as const, label: s.quit }
          ]
        } satisfies MenuItemConstructorOptions]
      : []),
    {
      label: s.file,
      submenu: [
        { label: s.exportCsv, accelerator: 'CmdOrCtrl+Shift+E', click: () => deps.send({ action: 'export' }) },
        { label: s.print, accelerator: 'CmdOrCtrl+P', click: () => deps.send({ action: 'print' }) },
        { type: 'separator' },
        { label: s.backup, accelerator: 'CmdOrCtrl+Shift+B', click: () => deps.send({ action: 'backup' }) },
        { label: s.restore, click: () => deps.send({ action: 'restore' }) },
        { type: 'separator' },
        isMac ? { role: 'close', label: s.close } : { role: 'quit', label: s.quit }
      ]
    },
    {
      label: s.edit,
      submenu: [
        { role: 'undo', label: s.undo },
        { role: 'redo', label: s.redo },
        { type: 'separator' },
        { role: 'cut', label: s.cut },
        { role: 'copy', label: s.copy },
        { role: 'paste', label: s.paste },
        { role: 'selectAll', label: s.selectAll }
      ]
    },
    {
      label: s.view,
      submenu: [
        { role: 'reload', label: s.reload },
        { role: 'toggleDevTools', label: s.toggleDevTools },
        { type: 'separator' },
        { role: 'resetZoom', label: s.resetZoom },
        { role: 'zoomIn', label: s.zoomIn },
        { role: 'zoomOut', label: s.zoomOut },
        { type: 'separator' },
        { role: 'togglefullscreen', label: s.fullscreen }
      ]
    },
    {
      label: s.go,
      submenu: [
        { label: s.dashboard, accelerator: 'CmdOrCtrl+1', click: () => go('/') },
        { label: s.invoices, accelerator: 'CmdOrCtrl+2', click: () => go('/invoices') },
        { label: s.journal, accelerator: 'CmdOrCtrl+3', click: () => go('/journal') },
        { label: s.reports, accelerator: 'CmdOrCtrl+4', click: () => go('/reports') },
        { type: 'separator' },
        { label: s.settings, accelerator: 'CmdOrCtrl+,', click: () => go('/settings') }
      ]
    },
    {
      label: s.language,
      submenu: [
        { label: s.arabic, type: 'radio', checked: lang === 'ar', click: () => deps.setLanguage('ar') },
        { label: s.english, type: 'radio', checked: lang === 'en', click: () => deps.setLanguage('en') }
      ]
    },
    {
      label: s.window,
      submenu: isMac
        ? [{ role: 'minimize', label: s.minimize }, { role: 'zoom' }, { type: 'separator' }, { role: 'front' }]
        : [{ role: 'minimize', label: s.minimize }, { role: 'close', label: s.close }]
    },
    {
      label: s.help,
      role: 'help',
      submenu: [{ label: s.about, click: () => showAbout(deps.getWindow(), s) }]
    }
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
};
