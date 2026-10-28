const { spawn, spawnSync } = require("node:child_process");
const { createHash, createHmac } = require("node:crypto");
const { appendFileSync, existsSync, readFileSync, unlinkSync } = require("node:fs");
const path = require("node:path");
const { setTimeout: delay } = require("node:timers/promises");

const environmentFile = path.join(__dirname, ".env");
if (existsSync(environmentFile)) process.loadEnvFile(environmentFile);
process.env.NODE_ENV = "production";

function extractStagedRelease() {
  const manifestPath = path.join(__dirname, "dnd-release-manifest.json");
  if (!existsSync(manifestPath)) return;
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (manifest.version !== 1 || !Array.isArray(manifest.archives)) throw new Error("Invalid release manifest");
  for (const archive of manifest.archives) {
    if (!/^dnd-nerds-[a-z-]+\.tar\.gz$/.test(archive.name) || !/^[a-f0-9]{64}$/.test(archive.sha256) || !Array.isArray(archive.parts)) throw new Error("Invalid release archive entry");
    const temp = path.join(__dirname, `${archive.name}.assembling`);
    const digest = createHash("sha256");
    try {
      if (existsSync(temp)) unlinkSync(temp);
      for (const name of archive.parts) {
        if (!/^dnd-release-[a-z-]+\.part\d{2}$/.test(name)) throw new Error("Invalid release part name");
        const bytes = readFileSync(path.join(__dirname, name));
        digest.update(bytes);
        appendFileSync(temp, bytes);
      }
      if (digest.digest("hex") !== archive.sha256) throw new Error(`Release checksum mismatch: ${archive.name}`);
      const result = spawnSync("tar", ["-xzf", temp, "-C", __dirname], { stdio: "inherit" });
      if (result.status !== 0) throw new Error(`Release extraction failed: ${archive.name}`);
    } finally {
      if (existsSync(temp)) unlinkSync(temp);
    }
  }
  for (const archive of manifest.archives) for (const name of archive.parts) unlinkSync(path.join(__dirname, name));
  unlinkSync(manifestPath);
  const checkFile = path.join(__dirname, "dnd-deploy-check.txt");
  if (existsSync(checkFile)) unlinkSync(checkFile);
  console.log("Staged release extracted and verified");
}

const apiFile = path.join(__dirname, "apps/api/dist/server.js");
const migrationFile = path.join(__dirname, "apps/api/dist/db/migrate-production.js");
const webFile = path.join(__dirname, "apps/web/server.js");
const vttFile = path.join(__dirname, "apps/vtt/server/server.mjs");
const webPort = process.env.SERVER_PORT || process.env.PORT;

if (!webPort) {
  throw new Error("Wispbyte must provide SERVER_PORT or PORT");
}

const children = new Set();
let stopping = false;
let proxyServer;

function launch(label, file, environment) {
  const child = spawn(process.execPath, [file], {
    cwd: path.dirname(file),
    env: { ...process.env, ...environment },
    stdio: "inherit",
  });
  children.add(child);
  child.on("exit", (code, signal) => {
    children.delete(child);
    if (!stopping) {
      console.error(`${label} exited (${signal || code}); stopping release`);
      shutdown(code || 1);
    }
  });
  return child;
}

function shutdown(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill("SIGTERM");
  proxyServer?.close();
  setTimeout(() => process.exit(code), 5000).unref();
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

async function start() {
extractStagedRelease();
if (!existsSync(vttFile)) throw new Error("VTT release is missing apps/vtt/server/server.mjs");
const bridgeRootKey = process.env.AUTH_SESSION_SECRET || process.env.MFA_ENCRYPTION_KEY;
if (!process.env.VTT_BRIDGE_SECRET && bridgeRootKey) {
  process.env.VTT_BRIDGE_SECRET = createHmac("sha256", bridgeRootKey)
    .update("dnd-nerds-vtt-bridge-v1").digest("hex");
}
if (!process.env.VTT_BRIDGE_SECRET || process.env.VTT_BRIDGE_SECRET.trim().length < 32) {
  throw new Error("A site security key or VTT_BRIDGE_SECRET must be set before starting this release");
}
const migration = spawn(process.execPath, [migrationFile], {
  cwd: path.dirname(apiFile),
  env: process.env,
  stdio: "inherit",
});
const migrationCode = await new Promise((resolve) => migration.on("exit", resolve));
if (migrationCode !== 0) {
  console.error("Database migration failed; site was not started");
  process.exit(1);
}

launch("API", apiFile, {
  API_HOST: "127.0.0.1", API_PORT: "4100",
  VTT_PUBLIC_URL: process.env.VTT_PUBLIC_URL || "https://dndnerds.wispbyte.app/vtt/",
});

let apiReady = false;
for (let attempt = 0; attempt < 40 && !stopping; attempt++) {
  try {
    const response = await fetch("http://127.0.0.1:4100/health");
    if (response.ok) {
      apiReady = true;
      break;
    }
  } catch {}
  await delay(500);
}

if (!apiReady) {
  console.error("API did not become healthy");
  shutdown(1);
} else {
  launch("VTT", vttFile, {
    PORT: "4200",
    VTT_BASE_PATH: "/vtt",
    DND_VTT_DATA_ROOT: path.join(__dirname, "data/vtt"),
  });
  launch("Web", webFile, {
    HOSTNAME: "0.0.0.0",
    PORT: "3100",
    MARKETPLACE_API_BASE_URL: "http://127.0.0.1:4100",
  });
  for (let attempt = 0; attempt < 120 && !stopping; attempt++) {
    try {
      const [web, vtt] = await Promise.all([
        fetch("http://127.0.0.1:3100/"),
        fetch("http://127.0.0.1:4200/api/access-info"),
      ]);
      if (web.ok && vtt.ok) {
        const { startProxy } = require("./proxy.cjs");
        proxyServer = startProxy(Number(webPort));
        return;
      }
    } catch {}
    await delay(500);
  }
  throw new Error("Web or VTT did not become healthy");
}
}

start().catch((error) => {
  console.error(error);
  shutdown(1);
});
