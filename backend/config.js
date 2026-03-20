import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadConfig() {
  const configPath = join(__dirname, 'config.json');
  let vaultPath = process.env.OBSIDIAN_VAULT_PATH || null;

  let reminderTime = process.env.REMINDER_TIME || '09:00';
  let reminderTimezone = process.env.REMINDER_TIMEZONE || 'Europe/Amsterdam';
  let calendar = {
    outlookIcsUrl: process.env.OUTLOOK_ICS_URL || null,
    outlookIcsAuth: process.env.OUTLOOK_ICS_AUTH || null,
    outlookIcsFile: process.env.OUTLOOK_ICS_FILE || null,
    outlookUseCom: process.env.OUTLOOK_USE_COM === 'true' || process.env.OUTLOOK_USE_COM === '1',
    google: process.env.GOOGLE_CALENDAR_CREDENTIALS ? { credentialsPath: process.env.GOOGLE_CALENDAR_CREDENTIALS } : null,
  };
  if (existsSync(configPath)) {
    try {
      const data = JSON.parse(readFileSync(configPath, 'utf-8'));
      vaultPath = vaultPath || data.vaultPath || null;
      reminderTime = data.reminderTime ?? reminderTime;
      reminderTimezone = data.reminderTimezone ?? reminderTimezone;
      if (data.outlookIcsUrl != null) calendar.outlookIcsUrl = data.outlookIcsUrl;
      if (data.outlookIcsAuth != null) calendar.outlookIcsAuth = data.outlookIcsAuth;
      if (data.outlookIcsFile != null) calendar.outlookIcsFile = data.outlookIcsFile;
      if (data.outlookUseCom != null) calendar.outlookUseCom = data.outlookUseCom;
      if (data.calendar) calendar = { ...calendar, ...data.calendar };
    } catch (_) {}
  }

  // Default: parent of task-app is the vault (PhD folder)
  if (!vaultPath) {
    vaultPath = join(__dirname, '..', '..');
  }

  return {
    vaultPath,
    reminderTime,
    reminderTimezone,
    port: parseInt(process.env.PORT || '3111', 10),
    calendar,
  };
}

export const config = loadConfig();
