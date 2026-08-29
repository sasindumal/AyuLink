#!/usr/bin/env node
/**
 * Live-demo mode: run `expo start --tunnel` for all four apps and write
 * their current exp:// URLs to frontend/web/public/demo/links.json, so
 * the demo hub can show live QR codes (Mode -> "Live dev tunnel").
 *
 *   node scripts/demo-tunnel.js            # all four
 *   node scripts/demo-tunnel.js patient    # just one
 *
 * This is for a demo you are ACTIVELY running from your machine — not a
 * deployment. `expo start --tunnel` is a dev server + an ngrok tunnel per
 * app; the URL changes every restart, and it stops when you Ctrl-C. It is
 * NOT something to leave running on Render (four Metro bundlers will not
 * fit a small instance, and free tiers sleep). For always-on, publish an
 * EAS Update instead: scripts/publish-demo-updates.sh.
 *
 * Serving the hub locally while tunnelling:
 *   (cd frontend/web && npm run dev)   # http://localhost:3000/demo/
 * links.json is under public/, so Next serves it live with no rebuild.
 */
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "frontend/web/public/demo/links.json");
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, "frontend/web/public/demo/config.json"), "utf8"));

const only = process.argv[2];
const apps = cfg.apps
  .filter((a) => !only || a.key === only)
  .map((a) => ({ key: a.key, dir: path.join(ROOT, "frontend/mobile", `${a.key === "center" ? "channeling-center" : a.key}-app`) }));

const links = {};
const write = () => fs.writeFileSync(OUT, JSON.stringify(links, null, 2) + "\n");
write();
console.log("links.json ->", path.relative(ROOT, OUT), "\n");

// each app on its own Metro port
apps.forEach((app, i) => {
  const port = 8081 + i;
  const p = spawn("npx", ["expo", "start", "--tunnel", "--port", String(port)], {
    cwd: app.dir,
    env: { ...process.env, CI: "1", EXPO_NO_TELEMETRY: "1" },
  });
  const scan = (buf) => {
    const m = String(buf).match(/exp:\/\/[^\s"']+/);
    if (m && links[app.key] !== m[0]) {
      links[app.key] = m[0];
      write();
      console.log(`  ${app.key.padEnd(9)} ${m[0]}`);
    }
  };
  p.stdout.on("data", scan);
  p.stderr.on("data", scan);
  p.on("exit", (code) => {
    delete links[app.key];
    write();
    console.log(`  ${app.key} tunnel exited (${code})`);
  });
});

process.on("SIGINT", () => {
  try { fs.unlinkSync(OUT); } catch {}
  console.log("\nstopped — links.json removed");
  process.exit(0);
});
