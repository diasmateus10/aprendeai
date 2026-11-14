// Daily check of PRODUCTION (e2e-prod/): a robot learner signs in to the real app and talks to the AI with a
// simulated microphone that plays a recorded English sentence. Nothing is faked on the server side: Supabase,
// Azure (hearing and voice) and Claude are the real ones, so a broken key, an exhausted quota or a client bug in
// the voice path fails it.
//
//   npm run test:prod      (needs SMOKE_EMAIL and SMOKE_PASSWORD: the robot account, in .env or the environment)
//
// Runs every day from GitHub Actions (.github/workflows/voice-daily.yml), which e-mails the owner when it fails.

import { defineConfig, devices } from "@playwright/test";
import { resolve } from "node:path";

try {
  process.loadEnvFile(".env");
} catch {
  // CI passes the variables directly.
}

const voice = resolve("e2e-prod/fixtures/coffee.wav");

export default defineConfig({
  testDir: "e2e-prod",
  timeout: 150_000,
  expect: { timeout: 20_000 },
  // One conversation at a time: the robot account shares its daily limits across tests.
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never", outputFolder: "e2e-prod-report" }]],
  outputDir: "e2e-prod-results",
  use: {
    baseURL: process.env.PROD_URL ?? "https://aprendeai-ruby.vercel.app",
    locale: "pt-BR",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "android-chrome",
      use: {
        ...devices["Pixel 7"],
        permissions: ["microphone"],
        launchOptions: {
          args: [
            "--use-fake-ui-for-media-stream",
            "--use-fake-device-for-media-stream",
            `--use-file-for-fake-audio-capture=${voice}`,
            "--autoplay-policy=no-user-gesture-required",
          ],
        },
      },
    },
  ],
});
