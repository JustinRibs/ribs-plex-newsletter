import { Cron } from 'croner';
import { TZ } from './config.js';
import { getSettings } from './db.js';
import { runNewsletter } from './email/send.js';

let job: Cron | null = null;

export function getScheduleStatus(): { enabled: boolean; cron: string; next: string | null; tz: string } {
  const s = getSettings();
  return {
    enabled: !!s.schedule_enabled,
    cron: s.schedule_cron,
    next: job ? (job.nextRun()?.toISOString() ?? null) : null,
    tz: TZ
  };
}

export function reloadScheduler(): void {
  if (job) {
    job.stop();
    job = null;
  }
  const s = getSettings();
  if (!s.schedule_enabled || !s.schedule_cron) return;
  try {
    job = new Cron(
      s.schedule_cron,
      { timezone: TZ, protect: true },
      async () => {
        console.log(`[scheduler] firing newsletter (cron=${s.schedule_cron} tz=${TZ})`);
        try {
          const r = await runNewsletter();
          console.log(`[scheduler] sent=${r.sent} failed=${r.failed} (${r.durationMs}ms)`);
        } catch (err) {
          console.error('[scheduler] newsletter run failed:', err);
        }
      }
    );
    const next = job.nextRun();
    console.log(`[scheduler] enabled — next run: ${next?.toISOString()} (${TZ})`);
  } catch (err) {
    console.error('[scheduler] invalid cron expression:', s.schedule_cron, err);
    job = null;
  }
}
