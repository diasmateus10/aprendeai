// Rewrites the learner's profile (their hardest points) after a conversation ends, so the chat
// doesn't wait for it. Retried on failure.

import Anthropic from "@anthropic-ai/sdk";
import { task } from "@trigger.dev/sdk";
import { updateInsights } from "../server/history.js";

export const updateLearnerInsights = task({
  id: "update-learner-insights",
  // One run per learner at a time (concurrencyKey = userId): two conversations ending together
  // would overwrite each other's profile.
  concurrency: { perKey: 1, total: 10 },
  run: async (payload: { userId: string }) => {
    await updateInsights(new Anthropic(), payload.userId);
  },
});
