// Trigger.dev: background tasks (trigger/), run outside the Vercel functions with automatic retries.
// Deploy with `npm run deploy:trigger`; the tasks read their own env vars, set in the Trigger.dev dashboard.

import { defineConfig } from "@trigger.dev/sdk";

export default defineConfig({
  project: process.env.TRIGGER_PROJECT_REF ?? "",
  dirs: ["./trigger"],
  maxDuration: 300,
  retries: {
    enabledInDev: true,
    default: { maxAttempts: 3, minTimeoutInMs: 5_000, maxTimeoutInMs: 60_000, factor: 2 },
  },
});
