import { query, type Queryable, pool } from '../lib/db.ts';

export async function audit(userId: number | null, action: string, entity?: string, entityId?: string | number | null, detail?: unknown, ip?: string, client: Queryable = pool) {
  await query('INSERT INTO audit_logs(user_id, action, entity, entity_id, detail, ip) VALUES ($1,$2,$3,$4,$5,$6)',
    [userId, action, entity ?? null, entityId != null ? String(entityId) : null, detail ? JSON.stringify(detail) : null, ip ?? null], client);
}
