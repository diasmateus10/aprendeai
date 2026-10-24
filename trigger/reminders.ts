// Daily study reminder at 19h Brasília: notifies everyone who hasn't studied yet today. Retried on
// failure; a device already notified today is skipped, so a retry never notifies twice.

import { schedules } from "@trigger.dev/sdk";
import { sendReminders } from "../server/push.js";

export const dailyReminders = schedules.task({
  id: "daily-study-reminders",
  cron: { pattern: "0 19 * * *", timezone: "America/Sao_Paulo" },
  run: async () => sendReminders(),
});
