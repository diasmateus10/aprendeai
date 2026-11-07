// The `test` used by every journey: a page with the fakes installed, plus the fake backend and AI to
// arrange the account and check what the app sent.

import { test as base, expect } from "@playwright/test";
import { FakeAI, FakeBackend, installFakes } from "./fakes";

export { expect };

/** A learner who already did the onboarding: adult, chosen level and the default themes. */
export function learner(overrides: Record<string, unknown> = {}) {
  return {
    mode: "adult",
    level: "iniciante",
    themes: ["comida", "viagem", "trabalho", "social", "filmes"],
    ...overrides,
  };
}

export const test = base.extend<{ signedIn: boolean; backend: FakeBackend; ai: FakeAI }>({
  signedIn: [true, { option: true }],
  backend: async ({}, use) => use(new FakeBackend()),
  ai: async ({}, use) => use(new FakeAI()),
  page: async ({ page, context, backend, ai, signedIn }, use) => {
    await installFakes(context, backend, ai, { signedIn });
    const errors: string[] = [];
    page.on("pageerror", (e) => {
      // WebKit's wording for a request cancelled by a reload: expected when a test reloads mid-save.
      if (e.message.includes("due to access control checks")) return;
      errors.push(e.message);
    });
    await use(page);
    // A crash in the app fails the test even when the screen looked fine.
    expect(errors, "uncaught errors in the page").toEqual([]);
  },
});
