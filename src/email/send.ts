import nodemailer, { type Transporter } from 'nodemailer';
import { getSettings, listActiveRecipients, logSend } from '../db.js';
import { composeNewsletter } from './compose.js';
import type { ComposedNewsletter, Settings } from '../types.js';

export function buildTransporter(s: Settings): Transporter {
  return nodemailer.createTransport({
    host: s.smtp_host,
    port: s.smtp_port,
    secure: !!s.smtp_secure,
    auth: s.smtp_user ? { user: s.smtp_user, pass: s.smtp_pass } : undefined,
    pool: true,
    maxConnections: 3
  });
}

export async function verifySmtp(s: Settings): Promise<{ ok: boolean; message: string }> {
  try {
    const t = buildTransporter(s);
    await t.verify();
    t.close();
    return { ok: true, message: 'SMTP connection OK' };
  } catch (err: any) {
    return { ok: false, message: err?.message || String(err) };
  }
}

export async function sendComposed(
  s: Settings,
  composed: ComposedNewsletter,
  recipients: { email: string; name?: string }[]
): Promise<{ sent: number; failed: number; errors: string[] }> {
  const transporter = buildTransporter(s);
  const fromAddr = s.smtp_from_email || s.smtp_user;
  const from = s.smtp_from_name ? `"${s.smtp_from_name}" <${fromAddr}>` : fromAddr;

  let sent = 0;
  let failed = 0;
  const errors: string[] = [];

  // Send individually so one bad address doesn't poison the batch
  for (const r of recipients) {
    const to = r.name ? `"${r.name}" <${r.email}>` : r.email;
    try {
      await transporter.sendMail({
        from,
        to,
        subject: composed.subject,
        html: composed.html,
        text: composed.text,
        attachments: composed.attachments.map((a) => ({
          filename: a.filename,
          content: a.content,
          contentType: a.contentType,
          cid: a.cid
        }))
      });
      sent += 1;
    } catch (err: any) {
      failed += 1;
      errors.push(`${r.email}: ${err?.message || err}`);
    }
  }

  transporter.close();
  return { sent, failed, errors };
}

export async function runNewsletter(opts: { dryRun?: boolean; testRecipient?: string } = {}): Promise<{ sent: number; failed: number; errors: string[]; recipientCount: number; durationMs: number }> {
  const start = Date.now();
  const settings = getSettings();
  const composed = await composeNewsletter(settings);

  let recipients: { email: string; name?: string }[];
  if (opts.testRecipient) {
    recipients = [{ email: opts.testRecipient }];
  } else {
    recipients = listActiveRecipients().map((r) => ({ email: r.email, name: r.name }));
  }

  if (recipients.length === 0) {
    const dur = Date.now() - start;
    if (!opts.dryRun) logSend({ recipient_count: 0, status: 'failed', message: 'No active recipients', duration_ms: dur });
    return { sent: 0, failed: 0, errors: ['No active recipients'], recipientCount: 0, durationMs: dur };
  }

  if (opts.dryRun) {
    const dur = Date.now() - start;
    return { sent: 0, failed: 0, errors: [], recipientCount: recipients.length, durationMs: dur };
  }

  const result = await sendComposed(settings, composed, recipients);
  const durationMs = Date.now() - start;
  const status: 'success' | 'partial' | 'failed' =
    result.failed === 0 ? 'success' : result.sent === 0 ? 'failed' : 'partial';
  const message =
    result.errors.length > 0
      ? `${result.sent} sent / ${result.failed} failed. ${result.errors.slice(0, 3).join('; ')}`
      : `${result.sent} sent`;

  // Don't log "test" sends as part of the regular history if it was a single test recipient.
  if (!opts.testRecipient) {
    logSend({ recipient_count: recipients.length, status, message, duration_ms: durationMs });
  }

  return { ...result, recipientCount: recipients.length, durationMs };
}
