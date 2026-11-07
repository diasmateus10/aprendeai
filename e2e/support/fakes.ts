// Stand-ins for everything outside the browser, so the journeys run offline, free and the same every time:
// - Supabase (auth + the tables the app reads/writes), kept in memory per test;
// - the AI conversation (/api/chat), with scripted replies and a log of what the app sent;
// - the voice (speechSynthesis) and the microphone (SpeechRecognition): the test decides what the learner "says".

import type { BrowserContext, Page, Route } from "@playwright/test";

const SUPABASE = "https://akctjmradduksgxnpian.supabase.co";
const STORAGE_KEY = "sb-akctjmradduksgxnpian-auth-token";

export const TEST_USER_ID = "00000000-0000-4000-8000-000000000001";

// ---------------------------------------------------------------------------------------------------------
// Browser side: fake voice and microphone. Runs before the app's own scripts on every page load.
// ---------------------------------------------------------------------------------------------------------

function browserFakes() {
  const w = window as unknown as Record<string, unknown> & {
    __spoken: string[];
    __mic: string[];
    __micError: string | null;
    __micStarts: number;
  };
  w.__spoken = [];
  w.__mic = [];
  w.__micError = null;
  w.__micStarts = 0;

  // Voice: records every line the app speaks and "finishes" it right away.
  type U = { text: string; onstart?: ((e: unknown) => void) | null; onend?: ((e: unknown) => void) | null };
  const synth = {
    speaking: false,
    pending: false,
    onvoiceschanged: null,
    getVoices: () => [],
    cancel() {},
    pause() {},
    resume() {},
    speak(u: U) {
      if (u.text) w.__spoken.push(u.text);
      setTimeout(() => {
        u.onstart?.({});
        setTimeout(() => u.onend?.({}), 10);
      }, 5);
    },
  };
  Object.defineProperty(window, "speechSynthesis", { value: synth, configurable: true });
  if (!("SpeechSynthesisUtterance" in window)) {
    (w as Record<string, unknown>).SpeechSynthesisUtterance = class {
      text: string;
      constructor(text: string) {
        this.text = text;
      }
    };
  }

  // Safari's audio mode (navigator.audioSession), so a test can check what the app asked for.
  if (!("audioSession" in navigator)) {
    Object.defineProperty(navigator, "audioSession", { value: { type: "auto" }, configurable: true });
  }

  // Microphone: each start() "hears" the next line queued by the test (window.__mic), or nothing.
  class FakeRecognition {
    lang = "en-US";
    interimResults = false;
    maxAlternatives = 1;
    continuous = false;
    onresult: ((e: unknown) => void) | null = null;
    onerror: ((e: { error: string }) => void) | null = null;
    onstart: (() => void) | null = null;
    onend: (() => void) | null = null;
    private ended = false;
    start() {
      w.__micStarts++;
      setTimeout(() => {
        if (w.__micError) {
          this.onerror?.({ error: w.__micError });
          this.end();
          return;
        }
        this.onstart?.();
        const text = w.__mic.shift();
        if (text === undefined) {
          // Nothing said: a one-shot recognition gives up on its own; push-to-talk waits for the release.
          if (!this.continuous) setTimeout(() => this.end(), 50);
          return;
        }
        const result = Object.assign([{ transcript: text, confidence: 0.95 }], { isFinal: true });
        this.onresult?.({ results: [result] });
      }, 30);
    }
    stop() {
      setTimeout(() => this.end(), 10);
    }
    abort() {
      this.end();
    }
    private end() {
      if (this.ended) return;
      this.ended = true;
      this.onend?.();
    }
  }
  w.SpeechRecognition = FakeRecognition;
  w.webkitSpeechRecognition = FakeRecognition;
}

// ---------------------------------------------------------------------------------------------------------
// Supabase in memory.
// ---------------------------------------------------------------------------------------------------------

function b64url(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj)).toString("base64url");
}

function makeSession(email: string) {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + 7 * 86_400;
  const user = {
    id: TEST_USER_ID,
    aud: "authenticated",
    role: "authenticated",
    email,
    email_confirmed_at: new Date().toISOString(),
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: {},
    identities: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  const access_token = `${b64url({ alg: "HS256", typ: "JWT" })}.${b64url({ sub: TEST_USER_ID, email, role: "authenticated", aud: "authenticated", exp, iat: now })}.fake`;
  return { access_token, token_type: "bearer", expires_in: exp - now, expires_at: exp, refresh_token: "fake-refresh", user };
}

export interface Subscription {
  status: string | null;
  plan: "monthly" | "yearly" | null;
  current_period_end: string | null;
  trial_end: string | null;
  cancel_at_period_end: boolean;
  had_trial: boolean;
}

export class FakeBackend {
  email = "aluno@teste.com";
  /** "Criar conta" with this e-mail finds an account that already exists. */
  accountExists = false;
  /** The account's saved progress (user_progress.data); null for a new account. */
  progress: Record<string, unknown> | null = null;
  progressUpdatedAt = new Date().toISOString();
  subscription: Subscription | null = null;
  premiumGrant = false;
  /** Every progress upload the app made, in order. */
  saves: Record<string, unknown>[] = [];
  /** Passwords that fail to sign in. */
  wrongPasswords = new Set(["senha-errada"]);

  /** Makes the account Premium (an active subscription). */
  makePremium() {
    this.subscription = {
      status: "active",
      plan: "monthly",
      current_period_end: new Date(Date.now() + 30 * 86_400_000).toISOString(),
      trial_end: null,
      cancel_at_period_end: false,
      had_trial: true,
    };
  }

  async handle(route: Route) {
    const req = route.request();
    const url = new URL(req.url());
    const cors = {
      "access-control-allow-origin": req.headers()["origin"] ?? "*",
      "access-control-allow-credentials": "true",
      "access-control-allow-methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS",
      "access-control-allow-headers": req.headers()["access-control-request-headers"] ?? "*",
      "access-control-expose-headers": "content-range, x-supabase-api-version",
    };
    const json = (status: number, body: unknown) =>
      route.fulfill({ status, headers: { ...cors, "content-type": "application/json" }, body: JSON.stringify(body) });
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });

    const path = url.pathname;
    const body = (() => {
      try {
        return req.postDataJSON() ?? {};
      } catch {
        return {};
      }
    })();

    // Auth
    if (path === "/auth/v1/token") {
      if (url.searchParams.get("grant_type") === "password") {
        if (this.wrongPasswords.has(body.password)) {
          return json(400, { code: 400, error_code: "invalid_credentials", msg: "Invalid login credentials" });
        }
        this.email = body.email;
      }
      return json(200, makeSession(this.email));
    }
    if (path === "/auth/v1/signup") {
      this.email = body.email;
      // Like Supabase with "Confirm email" on: an e-mail that already has an account gets a user with no
      // identities and no session, so nobody can tell who is registered.
      if (this.accountExists) return json(200, { ...makeSession(this.email).user, identities: [] });
      return json(200, makeSession(this.email));
    }
    if (path === "/auth/v1/user") return json(200, makeSession(this.email).user);
    if (path === "/auth/v1/logout") return route.fulfill({ status: 204, headers: cors });
    if (path.startsWith("/auth/v1/")) return json(200, {});

    // Tables
    const table = path.replace("/rest/v1/", "");
    const method = req.method();
    if (table === "user_progress") {
      if (method === "GET") {
        return json(200, this.progress ? [{ data: this.progress, updated_at: this.progressUpdatedAt }] : []);
      }
      const row = Array.isArray(body) ? body[0] : body;
      this.progress = row.data;
      this.progressUpdatedAt = row.updated_at ?? new Date().toISOString();
      this.saves.push(row.data);
      return route.fulfill({ status: 201, headers: cors });
    }
    if (method !== "GET") return route.fulfill({ status: 204, headers: cors });
    if (table === "subscriptions") return json(200, this.subscription ? [this.subscription] : []);
    if (table === "premium_grants") return json(200, this.premiumGrant ? [{ user_id: TEST_USER_ID }] : []);
    return json(200, []);
  }
}

// ---------------------------------------------------------------------------------------------------------
// AI conversation partner.
// ---------------------------------------------------------------------------------------------------------

export interface ChatRequest {
  topic: string;
  level: string;
  mode: "chat" | "feedback" | "translate";
  messages: { role: "user" | "assistant"; content: string }[];
  style: Record<string, string>;
  sessionId: string;
}

export const AI_LINES = {
  opening: "Hi there! Welcome to Bean Street Café. What would you like to drink today?",
  second: "Great choice! Do you want it hot or iced?\n💡 Dica: diga “I would like a coffee, please.” para soar mais educado.",
  third: "Perfect, one iced coffee coming up. Anything to eat?",
  /** "Traduzir" on the opening line. */
  openingPt: "Oi! Bem-vindo ao Bean Street Café. O que você gostaria de beber hoje?",
  feedback:
    "Resumo: Você pediu um café com clareza e manteve a conversa.\nPontos fortes: frases completas · boa educação\nPara melhorar: i want coffee → I would like a coffee, please\nPalavras novas: iced · to go · coming up",
};

export class FakeAI {
  requests: ChatRequest[] = [];
  /** Answers for the next requests, consumed first: an HTTP error status and body. */
  private failures: { status: number; body: string }[] = [];

  failNext(status: number, body = "busy") {
    this.failures.push({ status, body });
  }

  get chatTurns() {
    return this.requests.filter((r) => r.mode === "chat");
  }

  async handle(route: Route) {
    const body = route.request().postDataJSON() as ChatRequest;
    this.requests.push(body);
    const fail = this.failures.shift();
    if (fail) return route.fulfill({ status: fail.status, contentType: "text/plain; charset=utf-8", body: fail.body });
    let text: string;
    if (body.mode === "feedback") text = AI_LINES.feedback;
    else if (body.mode === "translate") text = AI_LINES.openingPt;
    else {
      const userTurns = body.messages.filter((m) => m.role === "user").length;
      text = [AI_LINES.opening, AI_LINES.second][userTurns] ?? AI_LINES.third;
    }
    return route.fulfill({ status: 200, contentType: "text/plain; charset=utf-8", body: text });
  }
}

// ---------------------------------------------------------------------------------------------------------
// Wiring.
// ---------------------------------------------------------------------------------------------------------

export async function installFakes(context: BrowserContext, backend: FakeBackend, ai: FakeAI, { signedIn }: { signedIn: boolean }) {
  await context.addInitScript(browserFakes);
  if (signedIn) {
    // Signed in once per tab: a reload keeps whatever the app did since (e.g. signing out).
    await context.addInitScript(
      ([key, session]) => {
        if (sessionStorage.getItem("__e2e_seeded")) return;
        sessionStorage.setItem("__e2e_seeded", "1");
        localStorage.setItem(key, session);
      },
      [STORAGE_KEY, JSON.stringify(makeSession(backend.email))] as const,
    );
  }
  await context.route(`${SUPABASE}/**`, (r) => backend.handle(r));
  await context.route("**/api/chat", (r) => ai.handle(r));
  // No recorded clips and no server voice: every line goes through the fake device voice, where the test hears it.
  await context.route("**/audio/manifest.json", (r) => r.fulfill({ json: {} }));
  await context.route("**/api/tts**", (r) => r.fulfill({ status: 503, body: "off" }));
  // Voice turns heard by the server are off, so the conversation uses the fake browser microphone above.
  await context.route("**/api/talk", (r) => r.fulfill({ status: 503, contentType: "application/json", body: '{"voice":false}' }));
  await context.route("**/api/push**", (r) => r.fulfill({ json: { ok: true } }));
  await context.route("**/api/billing/**", (r) => r.fulfill({ status: 503, body: "" }));
}

/** Queues what the learner will "say" the next time the microphone opens. */
export async function willSay(page: Page, ...lines: string[]) {
  await page.evaluate((l) => (window as unknown as { __mic: string[] }).__mic.push(...l), lines);
}

/** Makes the microphone fail (e.g. "not-allowed"), or work again with null. */
export async function micError(page: Page, error: string | null) {
  await page.evaluate((e) => ((window as unknown as { __micError: string | null }).__micError = e), error);
}

/** Every line the app spoke since the page loaded (or since clearSpoken). */
export async function spoken(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as unknown as { __spoken: string[] }).__spoken.slice());
}

export async function clearSpoken(page: Page) {
  await page.evaluate(() => ((window as unknown as { __spoken: string[] }).__spoken = []));
}
