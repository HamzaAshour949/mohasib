import { useEffect } from 'react';
import { api } from './ipc';

/**
 * Mirror an editor's unsaved state into the main process so the window close
 * guard can act on it. Registering false on unmount matters: a page that
 * navigates away while dirty would otherwise leave the guard armed forever.
 */
export const useDirtyDocument = (dirty: boolean): void => {
  useEffect(() => {
    void api.app.setDirty(dirty);
    return () => { void api.app.setDirty(false); };
  }, [dirty]);
};

/**
 * Ask before throwing away unsaved edits. Every path that replaces the open
 * document goes through this — opening a new one, closing the editor, letting
 * the menu navigate away — not just closing the window.
 */
export const confirmDiscard = async (): Promise<boolean> => {
  const { discard } = await api.app.confirmDiscard();
  return discard;
};
