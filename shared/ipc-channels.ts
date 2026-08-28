// Channel names and message shapes shared by the main process and the preload.
//
// The preload is bundled as one self-contained CommonJS file precisely so this
// module can be imported from it: a sandboxed preload cannot require a relative
// module at runtime, so anything it references has to be inlined at build time.

export const MENU_CHANNEL = 'app:menu';
export const READY_CHANNEL = 'app:ready';
export const DIRTY_CHANNEL = 'app:setDirty';
export const LANGUAGE_CHANNEL = 'app:setLanguage';
export const CONFIRM_DISCARD_CHANNEL = 'app:confirmDiscard';
export const SAVE_TEXT_FILE_CHANNEL = 'app:saveTextFile';
export const ABOUT_CHANNEL = 'app:about';

export type AppLanguage = 'ar' | 'en';

/** Actions the native menu can ask the renderer to perform. */
export type MenuAction =
  | 'backup'
  | 'restore'
  | 'print'
  | 'export'
  | 'navigate'
  | 'set-language';

export interface MenuMessage {
  action: MenuAction;
  /** For `navigate`, the hash route to open (e.g. `/invoices`). */
  route?: string;
  /** For `set-language`, the language the menu switched to. */
  language?: AppLanguage;
}

export interface SaveTextFileRequest {
  /** Suggested file name, extension included. */
  suggestedName: string;
  contents: string;
  /** Dialog filter label + extensions, e.g. `{ name: 'CSV', extensions: ['csv'] }`. */
  filter?: { name: string; extensions: string[] };
}

export interface SaveTextFileResult {
  ok: boolean;
  path?: string;
  /** `cancelled` when the user dismissed the dialog — not an error to report. */
  error?: string;
}
