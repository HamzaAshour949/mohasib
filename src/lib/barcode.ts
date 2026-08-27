// Most USB/Bluetooth barcode scanners act as keyboard wedges:
// they type the digits very quickly then send Enter.
// Heuristic: collect chars while inter-key delay < 50ms, finalize on Enter or 250ms idle.

import { useEffect, useRef } from 'react';

export interface BarcodeOpts {
  minLength?: number;       // default 4
  maxInterCharMs?: number;  // default 50
  finalizeIdleMs?: number;  // default 250
  onScan: (code: string) => void;
}

export const useBarcodeScanner = (opts: BarcodeOpts, enabled = true): void => {
  const bufferRef = useRef<string>('');
  const lastTsRef = useRef<number>(0);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const minLength = opts.minLength ?? 4;
  const maxInterCharMs = opts.maxInterCharMs ?? 50;
  const finalizeIdleMs = opts.finalizeIdleMs ?? 250;

  useEffect(() => {
    if (!enabled) return;

    const finalize = (): void => {
      const code = bufferRef.current.trim();
      bufferRef.current = '';
      if (code.length >= minLength) opts.onScan(code);
    };

    const onKey = (e: KeyboardEvent): void => {
      // Ignore when typing in inputs unless input has data-barcode attr
      const tgt = e.target as HTMLElement | null;
      const inField = tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.isContentEditable);
      const explicit = tgt?.getAttribute('data-barcode') === 'true';
      if (inField && !explicit) return;

      const now = performance.now();
      const dt = now - lastTsRef.current;
      lastTsRef.current = now;

      if (e.key === 'Enter') {
        if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
        finalize();
        return;
      }

      if (e.key.length !== 1) return; // ignore Shift/Ctrl/etc
      if (dt > maxInterCharMs && bufferRef.current.length > 0) {
        // Too slow → not a scan, reset
        bufferRef.current = '';
      }
      bufferRef.current += e.key;

      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      idleTimerRef.current = setTimeout(finalize, finalizeIdleMs);
    };

    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);
};
