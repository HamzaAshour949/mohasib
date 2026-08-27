import { db } from './db';

export const audit = (action: string, entity: string, entityId: number | null, payload?: unknown): void => {
  try {
    db().prepare('INSERT INTO audit_log (action, entity, entity_id, payload) VALUES (?, ?, ?, ?)')
      .run(action, entity, entityId ?? null, payload ? JSON.stringify(payload) : null);
  } catch { /* never fail user action because of audit */ }
};
