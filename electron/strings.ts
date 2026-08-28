import type { AppLanguage } from '@shared/ipc-channels';

/**
 * User-facing text owned by the main process: native menu labels and native
 * dialogs. It cannot come from the renderer's i18n bundle — react-i18next does
 * not exist here — so this is the translation layer for that side of the app.
 *
 * The renderer reports its language on mount and on every change, so the two
 * tables always agree on what the user is reading.
 */
export interface MainStrings {
  // menu
  file: string; edit: string; view: string; go: string; language: string; window: string; help: string;
  backup: string; restore: string; exportCsv: string; print: string; close: string; quit: string;
  undo: string; redo: string; cut: string; copy: string; paste: string; selectAll: string;
  reload: string; toggleDevTools: string; resetZoom: string; zoomIn: string; zoomOut: string;
  fullscreen: string; minimize: string;
  dashboard: string; invoices: string; journal: string; reports: string; settings: string;
  arabic: string; english: string; about: string; aboutDetail: string;
  services: string; hide: string; hideOthers: string; unhide: string;
  // dialogs
  cancel: string; replace: string;
  unsavedTitle: string; unsavedDetail: string; discardChanges: string;
  backupTitle: string; restoreTitle: string; sqliteFiles: string;
  restoreWarning: string; restoreWarningDetail: string;
  restoreDoneTitle: string; restoreDoneDetail: string;
  notADatabase: string;
}

const TABLE: Record<AppLanguage, MainStrings> = {
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
    unhide: 'إظهار الكل',
    cancel: 'إلغاء',
    replace: 'استبدال',
    unsavedTitle: 'لديك تغييرات غير محفوظة.',
    unsavedDetail: 'إذا تابعت فستفقد هذه التغييرات.',
    discardChanges: 'تجاهل التغييرات',
    backupTitle: 'نسخ احتياطي لقاعدة البيانات',
    restoreTitle: 'استعادة قاعدة البيانات',
    sqliteFiles: 'قاعدة بيانات SQLite',
    restoreWarning: 'ستحل النسخة المستعادة محل بياناتك الحالية.',
    restoreWarningDetail: 'سيتم حفظ نسخة أمان من البيانات الحالية قبل الاستبدال. هل تريد المتابعة؟',
    restoreDoneTitle: 'تمت الاستعادة',
    restoreDoneDetail: 'تم فتح قاعدة البيانات المستعادة. لا حاجة لإعادة تشغيل التطبيق.',
    notADatabase: 'الملف المحدد ليس قاعدة بيانات محاسب صالحة.'
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
    unhide: 'Show All',
    cancel: 'Cancel',
    replace: 'Replace',
    unsavedTitle: 'You have unsaved changes.',
    unsavedDetail: 'Continuing will discard them.',
    discardChanges: 'Discard changes',
    backupTitle: 'Back up database',
    restoreTitle: 'Restore database',
    sqliteFiles: 'SQLite database',
    restoreWarning: 'Restoring will replace your current data.',
    restoreWarningDetail: 'A safety copy of the current data is written first. Continue?',
    restoreDoneTitle: 'Restore complete',
    restoreDoneDetail: 'The restored database is open. No restart needed.',
    notADatabase: 'That file is not a valid Mohasib database.'
  }
};

let current: AppLanguage = 'ar';

export const setMainLanguage = (lng: AppLanguage): void => { current = lng; };
export const mainLanguage = (): AppLanguage => current;
export const S = (): MainStrings => TABLE[current];
