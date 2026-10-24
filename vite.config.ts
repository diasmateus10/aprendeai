import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import basicSsl from "@vitejs/plugin-basic-ssl";
import { chatApi } from "./server/chat";
import { ttsApi } from "./server/tts";
import { pushApi } from "./server/push";
import { billingApi } from "./server/billing";
import { accountApi } from "./server/account";

export default defineConfig(({ mode }) => {
  // Loads every variable from app/.env (no VITE_ prefix), so the key stays server-side only.
  const env = loadEnv(mode, process.cwd(), "");
  // The API handlers read their settings (Supabase, push keys) from process.env, as on Vercel.
  for (const [k, v] of Object.entries(env)) process.env[k] ??= v;
  // `npm run mobile`: phones on the same Wi-Fi need HTTPS, or the browser blocks the microphone.
  const mobile = mode === "mobile";
  return {
    plugins: [react(), chatApi(env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY),
      pushApi(),
      billingApi(),
      accountApi(),
      ttsApi(env.AZURE_SPEECH_KEY || process.env.AZURE_SPEECH_KEY, env.AZURE_SPEECH_REGION || process.env.AZURE_SPEECH_REGION), ...(mobile ? [basicSsl()] : [])],
    server: { port: mobile ? 5174 : 5173, host: mobile },
  };
});
