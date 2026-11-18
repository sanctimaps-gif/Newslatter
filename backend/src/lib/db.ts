import pg from 'pg';
import { env } from '../config/env.ts';

pg.types.setTypeParser(20, (v) => Number(v)); // BIGINT → number (identifiants < 2^53)
pg.types.setTypeParser(1700, (v) => Number(v));

export const pool = new pg.Pool({ connectionString: env.DATABASE_URL, max: 10 });

export type Queryable = pg.Pool | pg.PoolClient;

export async function query<T = any>(text: string, params: unknown[] = [], client: Queryable = pool): Promise<T[]> {
  const r = await client.query(text, params as any[]);
  return r.rows as T[];
}

export async function one<T = any>(text: string, params: unknown[] = [], client: Queryable = pool): Promise<T | null> {
  const rows = await query<T>(text, params, client);
  return rows[0] ?? null;
}

export async function tx<T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const r = await fn(c);
    await c.query('COMMIT');
    return r;
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    c.release();
  }
}
