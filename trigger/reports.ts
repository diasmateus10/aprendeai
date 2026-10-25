// Weekly progress reports for Premium learners: every Sunday at 20h Brasília, one run per learner who
// talked with the AI that week, each retried on its own; the learner gets a notification when it's ready.

import Anthropic from "@anthropic-ai/sdk";
import { schedules, task } from "@trigger.dev/sdk";
import { isPremium } from "../server/db.js";
import { sendToUser } from "../server/push.js";
import { activeLearners, writeWeeklyReport } from "../server/reports.js";

export const weeklyReport = task({
  id: "weekly-progress-report",
  concurrency: { total: 5 },
  run: async (payload: { userId: string }) => {
    const report = await writeWeeklyReport(new Anthropic(), payload.userId);
    if (!report) return { written: false };
    // A device problem shouldn't rerun the report: the notice is best effort.
    const sent = await sendToUser(payload.userId, "Seu relatório da semana chegou", report.headline, "/?relatorio").catch(() => 0);
    return { written: true, sent };
  },
});

export const weeklyReports = schedules.task({
  id: "weekly-progress-reports",
  cron: { pattern: "0 20 * * 0", timezone: "America/Sao_Paulo" },
  run: async () => {
    const learners = await activeLearners();
    const premium = (await Promise.all(learners.map(async (id) => ((await isPremium(id)) ? id : null)))).filter((id): id is string => !!id);
    for (let i = 0; i < premium.length; i += 100) {
      await weeklyReport.batchTrigger(premium.slice(i, i + 100).map((userId) => ({ payload: { userId } })));
    }
    return { active: learners.length, premium: premium.length };
  },
});
