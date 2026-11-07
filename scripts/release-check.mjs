// Pre-production check: everything that must pass before a deploy, in order, stopping at the first failure.
//
//   npm run release:check     only checks
//   npm run deploy            checks, then deploys to Vercel production (only if every step passed)
//
// Steps: types and production build -> unit tests -> end-to-end journeys (iPhone + Android) against the build.

import { spawnSync } from "node:child_process";

const steps = [
  { name: "Tipos e build de produção", cmd: "npm run build" },
  { name: "Tipos dos testes", cmd: "npx tsc -p tsconfig.test.json" },
  { name: "Testes unitários (pontuação, XP, conteúdo)", cmd: "npm run test:unit" },
  // Against the production bundle (vite preview), on a fresh server.
  { name: "Jornadas E2E (iPhone + Android)", cmd: "npx playwright test", env: { E2E_PREVIEW: "1" } },
];

const started = Date.now();
const results = [];
for (const step of steps) {
  console.log(`\n=== ${step.name} ===\n$ ${step.cmd}\n`);
  const t = Date.now();
  const run = spawnSync(step.cmd, { stdio: "inherit", shell: true, env: { ...process.env, ...step.env } });
  const ok = run.status === 0;
  results.push({ name: step.name, ok, s: Math.round((Date.now() - t) / 1000) });
  if (!ok) break;
}

console.log("\n=== Resumo antes de produção ===");
for (const r of results) console.log(`${r.ok ? "OK   " : "FALHOU"} ${r.name} (${r.s}s)`);
for (const s of steps.slice(results.length)) console.log(`--    ${s.name} (não rodou)`);
const allOk = results.length === steps.length && results.every((r) => r.ok);
console.log(`\nTotal: ${Math.round((Date.now() - started) / 1000)}s`);
if (!allOk) {
  console.log("\nNÃO publique: corrija o que falhou. Relatório das jornadas: npx playwright show-report e2e-report");
  process.exit(1);
}
console.log("\nTudo certo para publicar.");
