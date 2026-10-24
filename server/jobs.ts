// Hands work to the Trigger.dev tasks (trigger/). Without TRIGGER_SECRET_KEY (or if Trigger.dev is
// down), the insights run inline as before, and the trial reminder is skipped.

import Anthropic from "@anthropic-ai/sdk";
import { tasks } from "@trigger.dev/sdk";
import type { updateLearnerInsights } from "../trigger/insights.js";
import type { trialEndingReminder } from "../trigger/trial.js";
import { updateInsights } from "./history.js";

const enabled = () => Boolean(process.env.TRIGGER_SECRET_KEY);

/** Updates the learner's profile after a conversation: in the background when possible. */
export async function queueInsights(client: Anthropic, userId: string) {
  if (enabled()) {
    try {
      await tasks.trigger<typeof updateLearnerInsights>("update-learner-insights", { userId }, { concurrencyKey: userId });
      return;
    } catch (e) {
      console.error("[jobs] trigger failed, running inline:", (e as Error).message);
    }
  }
  try {
    await updateInsights(client, userId);
  } catch (e) {
    // The profile just stays as it was; the next conversation tries again.
    console.error("[history] insights failed:", (e as Error).message);
  }
}

const NOTICE_BEFORE_END_MS = 2 * 86_400_000;

/** Schedules the "trial ends in 2 days" notice; once per subscription. */
export async function scheduleTrialReminder(userId: string, subscriptionId: string, trialEnd: Date) {
  if (!enabled()) return;
  const at = new Date(trialEnd.getTime() - NOTICE_BEFORE_END_MS);
  if (at.getTime() <= Date.now()) return;
  try {
    await tasks.trigger<typeof trialEndingReminder>(
      "trial-ending-reminder",
      { userId, subscriptionId },
      { delay: at, idempotencyKey: `trial-ending-${subscriptionId}` },
    );
  } catch (e) {
    console.error("[jobs] trial reminder not scheduled:", (e as Error).message);
  }
}
