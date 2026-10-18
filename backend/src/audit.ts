import type { Request } from 'express';

import { prisma } from './prisma';

// =========================
// SECURITY LOG
// Records important account events. The user sees their own log on the
// Settings page, so they can notice a login they didn't make.
// Only the event name, time and IP are stored - no passwords, no tokens.
// =========================

export type AuditEvent =
  | 'register'
  | 'login_success'
  | 'login_failed'
  | 'logout_all'
  | 'password_changed'
  | 'monobank_connected'
  | 'monobank_removed'
  | 'data_exported';

// Old entries are removed: IP addresses are personal data too (GDPR)
const KEEP_DAYS = 90;

export async function logEvent(
  userId: number | null,
  event: AuditEvent,
  req: Request,
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId,
        event,
        ip: (req.ip ?? '').slice(0, 64) || null,
      },
    });
  } catch (error) {
    // A logging problem must never break login itself
    console.error('Failed to write audit log:', error);
  }
}

export async function cleanupOldAuditLogs(): Promise<void> {
  const cutoff = new Date(Date.now() - KEEP_DAYS * 24 * 60 * 60 * 1000);

  await prisma.auditLog.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });
}
