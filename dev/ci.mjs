// Local CI for the Platform: run before every merge.
//
//   npm run ci                 all steps
//   npm run ci -- --from unit  start at a step (lint, typecheck-api, typecheck-web, unit, integration, build-api, build-web)
//
// The integration tests start their own PostgreSQL (embedded-postgres) and need
// a Redis-compatible server: REDIS_URL, or GARNET_SERVER_PATH to GarnetServer.
// Lint fails on any error, or on more warnings than dev/ci-baseline.json allows.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const api = path.join(root, "apps", "api");
const web = path.join(root, "apps", "web");
const baseline = JSON.parse(fs.readFileSync(path.join(root, "dev", "ci-baseline.json"), "utf8"));
const npx = process.platform === "win32" ? "npx.cmd" : "npx";
const npm = process.platform === "win32" ? "npm.cmd" : "npm";

const run = (command, args, cwd, env = {}) => spawnSync(command, args, { cwd, env: { ...process.env, ...env }, encoding: "utf8", shell: process.platform === "win32" && command !== process.execPath });

const steps = [
  { id: "lint", title: "Lint", exec: () => {
    const result = run(npx, ["oxlint", "apps/api/src", "apps/api/tests", "apps/api/dev", "apps/web/src", "dev"], root);
    const output = `${result.stdout}${result.stderr}`;
    const warnings = (output.match(/: warning /g) ?? []).length;
    const errors = (output.match(/: error /g) ?? []).length;
    const ok = result.status === 0 && errors === 0 && warnings <= baseline.lintWarnings;
    return { ok, detail: `${errors} errors, ${warnings} warnings (baseline ${baseline.lintWarnings})`, output: ok ? "" : output };
  } },
  { id: "typecheck-api", title: "API typecheck", exec: () => result(run(npx, ["tsc", "--noEmit", "-p", "tsconfig.json"], api)) },
  { id: "typecheck-web", title: "Website typecheck", exec: () => result(run(npx, ["tsc", "--noEmit"], web)) },
  { id: "unit", title: "Unit tests", exec: () => tests(run(process.execPath, ["--import", "tsx", "--test", "tests/*.test.ts"], api)) },
  { id: "integration", title: "Integration tests", exec: () => {
    if (!process.env.REDIS_URL && !process.env.GARNET_SERVER_PATH) return { ok: false, detail: "set REDIS_URL or GARNET_SERVER_PATH", output: "" };
    return tests(run(process.execPath, ["--import", "tsx", "--test", "--test-force-exit", "--test-concurrency=1", "tests/integration/*.test.ts"], api));
  } },
  { id: "build-api", title: "API build", exec: () => result(run(npm, ["run", "build"], api)) },
  { id: "build-web", title: "Website build", exec: () => result(run(npx, ["next", "build"], web, { NEXT_TELEMETRY_DISABLED: "1" })) },
];

function result(spawned) {
  return { ok: spawned.status === 0, detail: "", output: spawned.status === 0 ? "" : `${spawned.stdout}${spawned.stderr}` };
}

function tests(spawned) {
  const output = `${spawned.stdout}${spawned.stderr}`;
  const pass = output.match(/^ℹ pass (\d+)/m)?.[1] ?? "0";
  const fail = output.match(/^ℹ fail (\d+)/m)?.[1] ?? "?";
  return { ok: spawned.status === 0 && fail === "0", detail: `${pass} passed, ${fail} failed`, output: spawned.status === 0 ? "" : output };
}

const fromIndex = process.argv.includes("--from") ? steps.findIndex((step) => step.id === process.argv[process.argv.indexOf("--from") + 1]) : 0;
if (fromIndex < 0) throw new Error(`Unknown step. Steps: ${steps.map((step) => step.id).join(", ")}`);
for (const step of steps.slice(fromIndex)) {
  const started = Date.now();
  process.stdout.write(`${step.title}… `);
  const outcome = step.exec();
  const seconds = Math.round((Date.now() - started) / 1000);
  console.log(`${outcome.ok ? "passed" : "FAILED"} (${seconds} s)${outcome.detail ? `: ${outcome.detail}` : ""}`);
  if (!outcome.ok) {
    console.log(outcome.output.split("\n").slice(-60).join("\n"));
    process.exit(1);
  }
}
console.log("\nLocal CI passed.");
