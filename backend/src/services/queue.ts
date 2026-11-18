// File d'attente persistante dans PostgreSQL (verrouillage SKIP LOCKED).
import { one, query, type Queryable, pool } from '../lib/db.ts';

export interface Job { id: number; job_type: string; payload: any; attempts: number; max_attempts: number }

export async function enqueue(jobType: string, payload: object = {}, opts: { runAt?: Date; dedupeKey?: string; maxAttempts?: number } = {}, client: Queryable = pool) {
  return one<{ id: number }>(`INSERT INTO scheduled_jobs(job_type, payload, run_at, dedupe_key, max_attempts)
    VALUES ($1,$2,$3,$4,$5) ON CONFLICT (dedupe_key) DO NOTHING RETURNING id`,
  [jobType, JSON.stringify(payload), opts.runAt ?? new Date(), opts.dedupeKey ?? null, opts.maxAttempts ?? 5], client);
}

export async function claimJob(workerId: string): Promise<Job | null> {
  return one<Job>(`UPDATE scheduled_jobs SET status='running', locked_at=now(), locked_by=$1, attempts=attempts+1
    WHERE id = (SELECT id FROM scheduled_jobs WHERE status='pending' AND run_at <= now()
                ORDER BY run_at, id FOR UPDATE SKIP LOCKED LIMIT 1)
    RETURNING id, job_type, payload, attempts, max_attempts`, [workerId]);
}

export async function completeJob(id: number) {
  await query(`UPDATE scheduled_jobs SET status='done', finished_at=now(), locked_at=NULL WHERE id=$1`, [id]);
}

export async function failJob(job: Job, error: string) {
  const final = job.attempts >= job.max_attempts;
  const backoffSec = Math.min(3600, 30 * 2 ** (job.attempts - 1));
  await query(`UPDATE scheduled_jobs SET status=$2, last_error=$3, locked_at=NULL,
    run_at = CASE WHEN $2='pending' THEN now() + ($4 || ' seconds')::interval ELSE run_at END,
    finished_at = CASE WHEN $2='failed' THEN now() ELSE NULL END WHERE id=$1`,
  [job.id, final ? 'failed' : 'pending', error.slice(0, 1000), String(backoffSec)]);
}

/** Tâches bloquées (worker arrêté brutalement) : remises en file. */
export async function recoverStaleJobs(minutes = 10) {
  return query(`UPDATE scheduled_jobs SET status='pending', locked_at=NULL, last_error='Reprise après arrêt du worker'
    WHERE status='running' AND locked_at < now() - ($1 || ' minutes')::interval RETURNING id`, [String(minutes)]);
}
