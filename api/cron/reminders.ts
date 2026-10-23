// Daily reminder job, scheduled in vercel.json. Vercel sends "Authorization: Bearer <CRON_SECRET>".

import type { IncomingMessage, ServerResponse } from "node:http";
import { handleCron } from "../../server/push.js";

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  await handleCron(req, res);
}
