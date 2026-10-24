// Two days before the free trial ends, reminds the learner on their devices (if they turned
// notifications on). Skipped when the trial was canceled or already turned into a paid plan.

import { task } from "@trigger.dev/sdk";
import { db } from "../server/db.js";
import { sendToUser } from "../server/push.js";

export const trialEndingReminder = task({
  id: "trial-ending-reminder",
  run: async (payload: { userId: string; subscriptionId: string }) => {
    const supabase = db();
    if (!supabase) throw new Error("SUPABASE_SECRET_KEY is required");
    const { data } = await supabase
      .from("subscriptions")
      .select("stripe_subscription_id, status, cancel_at_period_end")
      .eq("user_id", payload.userId)
      .maybeSingle();
    if (data?.stripe_subscription_id !== payload.subscriptionId || data.status !== "trialing" || data.cancel_at_period_end) {
      return { sent: 0, skipped: true };
    }
    const sent = await sendToUser(
      payload.userId,
      "Seu teste grátis acaba em 2 dias",
      "Aproveite para conversar com a IA e fazer as unidades Premium. Depois, a assinatura continua automaticamente.",
    );
    return { sent, skipped: false };
  },
});
