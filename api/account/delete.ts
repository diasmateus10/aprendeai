// Vercel serverless function for /api/account/delete. Locally the same handler runs as Vite middleware (server/account.ts).

import type { IncomingMessage, ServerResponse } from "node:http";
import { handleDeleteAccount } from "../../server/account.js";

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  await handleDeleteAccount(req, res);
}
