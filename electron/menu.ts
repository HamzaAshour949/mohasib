import { app, Menu, dialog, type BrowserWindow, type MenuItemConstructorOptions } from 'electron';
import { MENU_CHANNEL, type AppLanguage, type MenuMessage } from '@shared/ipc-channels';

/**
 * Menu labels live here rather than in the renderer's i18n bundle because the
 * native menu is built by the main process, which has no access to
 * react-i18next. The renderer reports its language on mount and on every
 * change, and the menu is rebuilt to match.
 */
interface MenuStrings {
  file: string; edit: string; view: string; go: string; language: string; window: string; help: string;
  backup: string; restore: string; exportCsv: string; print: string; close: string; quit: string;
  undo: string; redo: string; cut: string; copy: string; paste: string; selectAll: string;
  reload: string; toggleDevTools: string; resetZoom: string; zoomIn: string; zoomOut: string;
  fullscreen: string; minimize: string;
  dashboard: string; invoices: string; journal: string; reports: string; settings: string;
  arabic: string; english: string; about: string; aboutDetail: string;
  services: string; hide: string; hideOthers: string; unhide: string;
}

const STRINGS: Record<AppLanguage, MenuStrings> = {
  ar: {
    file: 'ملف',
    edit: 'تحرير',
    view: 'عرض',
    go: 'انتقال',
    language: 'اللغة',
    window: 'نافذة',
    help: 'مساعدة',
    backup: 'نسخ احتياطي لقاعدة البيانات…',
    restore: 'استعادة قاعدة البيانات…',
    exportCsv: 'تصدير العرض الحالي (CSV)…',
    print: 'طباعة…',
    close: 'إغلاق',
    quit: 'إنهاء',
    undo: 'تراجع',
    redo: 'إعادة',
    cut: 'قص',
    copy: 'نسخ',
    paste: 'لصق',
    selectAll: 'تحديد الكل',
    reload: 'إعادة تحميل',
    toggleDevTools: 'أدوات المطوّر',
    resetZoom: 'حجم فعلي',
    zoomIn: 'تكبير',
    zoomOut: 'تصغير',
    fullscreen: 'ملء الشاشة',
    minimize: 'تصغير النافذة',
    dashboard: 'لوحة المعلومات',
    invoices: 'الفواتير',
    journal: 'اليومية',
    reports: 'التقارير',
    settings: 'الإعدادات',
    arabic: 'العربية',
    english: 'English',
    about: 'حول محاسب',
    aboutDetail: 'تطبيق محاسبة ومخزون محلي، عربي أولًا. بدون ربا وبدون ضرائب.',
    services: 'خدمات',
    hide: 'إخفاء محاسب',
    hideOthers: 'إخفاء الآخرين',
    unhide: 'إظهار الكل'
  },
  en: {
    file: 'File',
    edit: 'Edit',
    view: 'View',
    go: 'Go',
    language: 'Language',
    window: 'Window',
    help: 'Help',
    backup: 'Back up database…',
    restore: 'Restore database…',
    exportCsv: 'Export current view (CSV)…',
    print: 'Print…',
    close: 'Close',
    quit: 'Quit',
    undo: 'Undo',
    redo: 'Redo',
    cut: 'Cut',
    copy: 'Copy',
    paste: 'Paste',
    selectAll: 'Select All',
    reload: 'Reload',
    toggleDevTools: 'Toggle Developer Tools',
    resetZoom: 'Actual Size',
    zoomIn: 'Zoom In',
    zoomOut: 'Zoom Out',
    fullscreen: 'Toggle Full Screen',
    minimize: 'Minimize',
    dashboard: 'Dashboard',
    invoices: 'Invoices',
    journal: 'Journal',
    reports: 'Reports',
    settings: 'Settings',
    arabic: 'العربية',
    english: 'English',
    about: 'About Mohasib',
    aboutDetail: 'Local-first, Arabic-first accounting and inventory. No interest, no taxes.',
    services: 'Services',
    hide: 'Hide Mohasib',
    hideOthers: 'Hide Others',
    unhide: 'Show All'
  }
};

export interface MenuDeps {
  getWindow: () => BrowserWindow | null;
  send: (message: MenuMessage) => void;
  setLanguage: (lng: AppLanguage) => void;
}

const showAbout = (window: BrowserWindow | null, s: MenuStrings): void => {
  const detail = `${s.aboutDetail}\n\nElectron ${process.versions.electron} · Chromium ${process.versions.chrome} · Node ${process.versions.node}`;
  const options = { type: 'info' as const, title: s.about, message: `Mohasib ${app.getVersion()}`, detail, buttons: ['OK'] };
  if (window) void dialog.showMessageBox(window, options);
  else void dialog.showMessageBox(options);
};

export const buildMenu = (lang: AppLanguage, deps: MenuDeps): void => {
  const s = STRINGS[lang] ?? STRINGS.en;
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
