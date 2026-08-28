import { useEffect, useRef } from 'react';

/**
 * The native File menu offers "Export current view" and "Print", which only
 * mean something to whichever page is on screen. Pages register their handlers
 * here and the menu listener in App.tsx calls whatever is currently registered.
 */
export interface ViewActions {
  onExport?: () => void;
  onPrint?: () => void;
}

let current: ViewActions = {};

export const useViewActions = (actions: ViewActions): void => {
  const ref = useRef<ViewActions>(actions);
  ref.current = actions;
  useEffect(() => {
    const registered: ViewActions = {
      onExport: () => ref.current.onExport?.(),
      onPrint: () => ref.current.onPrint?.()
    };
    current = registered;
    return () => { if (current === registered) current = {}; };
  }, []);
};

export const runViewAction = (key: keyof ViewActions): boolean => {
  const handler = current[key];
  if (!handler) return false;
  handler();
  return true;
};
