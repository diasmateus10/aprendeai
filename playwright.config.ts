// End-to-end journeys (e2e/): a robot learner goes through the app on an iPhone (WebKit, Safari's engine)
// and an Android phone (Chromium). Supabase, the AI, the voice and the microphone are simulated (e2e/support).
//
//   npm run test:e2e            against the dev server
//   npm run release:check       build + every test, against the production build (run before deploying)

import { defineConfig, devices } from "@playwright/test";

const PORT = 5199;
// release:check sets E2E_PREVIEW=1 to test the built bundle that goes to production.
const preview = !!process.env.E2E_PREVIEW;

export default defineConfig({
  testDir: "e2e",
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  workers: process.env.CI ? 2 : undefined,
  retries: process.env.CI ? 1 : 0,
  forbidOnly: !!process.env.CI,
  reporter: [["list"], ["html", { open: "never", outputFolder: "e2e-report" }]],
  outputDir: "e2e-results",
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: "pt-BR",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "iphone", use: { ...devices["iPhone 15"] } },
    { name: "android", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: preview ? `npx vite preview --port ${PORT} --strictPort` : `npx vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI && !preview,
    timeout: 120_000,
  },
});
