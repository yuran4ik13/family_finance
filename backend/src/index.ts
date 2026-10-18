import { app } from './app';
import { cleanupOldAuditLogs } from './audit';
import { config } from './config';

app.listen(config.port, () => {
  console.log(`Server is running on http://localhost:${config.port}`);
});

// Remove security log entries older than 90 days, once a day
const DAY_MS = 24 * 60 * 60 * 1000;

void cleanupOldAuditLogs().catch((error) =>
  console.error('Audit log cleanup failed:', error),
);

setInterval(() => {
  void cleanupOldAuditLogs().catch((error) =>
    console.error('Audit log cleanup failed:', error),
  );
}, DAY_MS).unref();
