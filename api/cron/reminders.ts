// Runs the daily reminders by hand (the schedule itself is on Trigger.dev, trigger/reminders.ts).
// Needs "Authorization: Bearer <CRON_SECRET>".

import type { IncomingMessage, ServerResponse } from "node:http";
import { handleCron } from "../../server/push.js";

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  await handleCron(req, res);
}
