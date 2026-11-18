// Worker persistant, indépendant du navigateur : traite la file d'attente PostgreSQL.
import { hostname } from 'node:os';
import { env } from '../../backend/src/config/env.ts';
import { pool } from '../../backend/src/lib/db.ts';
import { claimJob, completeJob, failJob, type Job } from '../../backend/src/services/queue.ts';
import { daily, tick } from './jobs/maintenance.ts';
import { sendCampaignBatch } from './processors/campaign.ts';
import { onConfirmed, sendConfirmationEmail, sendPasswordReset } from './processors/emails.ts';
import { prepareCampaign } from '../../backend/src/services/campaigns.ts';

export async function processJob(job: Job) {
  switch (job.job_type) {
    case 'email.confirmation': return sendConfirmationEmail(job.payload.subscriberId, job.payload.token);
    case 'email.password_reset': return sendPasswordReset(job.payload.userId, job.payload.url);
    case 'automation.on_confirm': return onConfirmed(job.payload.subscriberId);
    case 'campaign.prepare': return prepareCampaign(job.payload.campaignId);
    case 'campaign.send_batch': return sendCampaignBatch(job.payload.campaignId);
    case 'maintenance.daily': return daily();
    default: throw new Error(`Type de tâche inconnu : ${job.job_type}`);
  }
}

/** Traite toutes les tâches prêtes (utilisé aussi par les tests). */
export async function drain(workerId = 'drain', max = 1000) {
  let n = 0;
  for (; n < max; n++) {
    const job = await claimJob(workerId);
    if (!job) break;
    try { await processJob(job); await completeJob(job.id); }
    catch (e: any) { await failJob(job, e?.message ?? String(e)); }
  }
  return n;
}

async function main() {
  const workerId = `${hostname()}-${process.pid}`;
  let running = true;
  const stop = () => { running = false; console.log('Arrêt demandé, fin de la tâche en cours…'); };
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
  console.log(`Worker ${workerId} démarré${env.MAIL_SANDBOX ? ' — MODE BAC À SABLE : aucun e-mail ne sort vers Internet' : ''}.`);
  let lastTick = 0;
  while (running) {
    try {
      if (Date.now() - lastTick > 15_000) { await tick(workerId); lastTick = Date.now(); }
      const job = await claimJob(workerId);
      if (!job) { await new Promise((r) => setTimeout(r, 1000)); continue; }
      try {
        const res = await processJob(job);
        await completeJob(job.id);
        console.log(`✔ ${job.job_type} #${job.id}`, res && typeof res === 'object' ? JSON.stringify(res) : res ?? '');
      } catch (e: any) {
        await failJob(job, e?.message ?? String(e));
        console.error(`✖ ${job.job_type} #${job.id} (tentative ${job.attempts}/${job.max_attempts}) : ${e?.message ?? e}`);
      }
    } catch (e: any) {
      console.error('Erreur de boucle (base indisponible ?) :', e?.message ?? e);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
  await pool.end();
}

if (import.meta.url === `file://${process.argv[1]}`) main();
