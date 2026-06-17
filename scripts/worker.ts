/**
 * scripts/worker.ts — Long-running queue worker.
 *
 * Runs in a loop: drainOnce() -> advanceDueRuns() -> sleep -> repeat.
 * Use this in production instead of (or alongside) the /api/cron/* routes —
 * it has lower latency and no cold-start cost.
 *
 *   Run: `pnpm queue:worker`
 *   Stop: SIGINT (Ctrl-C) — finishes the current iteration cleanly.
 */
import 'dotenv/config';
import { drainOnce } from '../src/lib/queue/sender';
import { advanceDueRuns } from '../src/lib/automation/runner';

const BATCH_SIZE = Number(process.env.WORKER_BATCH_SIZE ?? 100);
const IDLE_SLEEP_MS = Number(process.env.WORKER_IDLE_SLEEP_MS ?? 5000);
const BUSY_SLEEP_MS = Number(process.env.WORKER_BUSY_SLEEP_MS ?? 250);

let stopping = false;
const stop = () => {
  if (stopping) {
    console.log('\nForce exit');
    process.exit(1);
  }
  console.log('\nGraceful shutdown — finishing current batch…');
  stopping = true;
};

process.on('SIGINT', stop);
process.on('SIGTERM', stop);

async function loop() {
  console.log('Worker started — batch size %d', BATCH_SIZE);
  while (!stopping) {
    const start = Date.now();
    try {
      const queueResult = await drainOnce({ batchSize: BATCH_SIZE });
      const autoResult = await advanceDueRuns({ limit: 50 });

      const total = (queueResult.sent ?? 0) + (queueResult.failed ?? 0) + (autoResult.processed ?? 0);
      if (total > 0) {
        console.log(
          '[%s] sent=%d failed=%d automations=%d (in %dms)',
          new Date().toISOString(),
          queueResult.sent ?? 0,
          queueResult.failed ?? 0,
          autoResult.processed ?? 0,
          Date.now() - start,
        );
      }

      await sleep(total === 0 ? IDLE_SLEEP_MS : BUSY_SLEEP_MS);
    } catch (err) {
      console.error('Worker error:', err);
      await sleep(IDLE_SLEEP_MS);
    }
  }
  console.log('Worker stopped.');
  process.exit(0);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

loop();
