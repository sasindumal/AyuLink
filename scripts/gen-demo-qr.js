#!/usr/bin/env node
/**
 * Regenerate the demo-hub QR codes from frontend/web/public/demo/config.json.
 *
 *   node scripts/gen-demo-qr.js          # Expo Go (EAS Update) + APK QRs
 *   node scripts/gen-demo-qr.js --apk-only
 *   node scripts/gen-demo-qr.js --eas-only
 *
 * Writes PNGs into frontend/web/public/demo/qr/ and copies the qrcode
 * browser build into frontend/web/public/demo/vendor/ so the hub can
 * regenerate QRs client-side in live-tunnel mode.
 *
 * Needs `npm i qrcode` somewhere on the path — this script has no
 * package.json of its own; run it from a dir that has qrcode installed
 * (e.g. `cd frontend/web && npm i -D qrcode && node ../../scripts/gen-demo-qr.js`).
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DEMO = path.join(ROOT, "frontend/web/public/demo");
const cfg = JSON.parse(fs.readFileSync(path.join(DEMO, "config.json"), "utf8"));

let QRCode;
try {
    QRCode = require("qrcode");
} catch {
    console.error(
        "\n  qrcode not found. Install it and re-run, e.g.:\n" +
        "    cd frontend/web && npm i -D qrcode && node ../../scripts/gen-demo-qr.js\n"
    );
    process.exit(1);
}

const FOREST = "#25671E";
const WHITE = "#FFFFFF";
const apkOnly = process.argv.includes("--apk-only");
const easOnly = process.argv.includes("--eas-only");
const channel = cfg.updateChannel || "preview";

fs.mkdirSync(path.join(DEMO, "qr"), { recursive: true });
fs.mkdirSync(path.join(DEMO, "vendor"), { recursive: true });

/** Expo Go deep link for a published EAS Update on the configured channel. */
function easLink(app) {
    return `exp://u.expo.dev/${app.easProjectId}?channel-name=${channel}`;
}

(async () => {
    for (const app of cfg.apps) {
        const targets = [];
        if (!apkOnly) targets.push(["eas", easLink(app)]);
        if (!easOnly) targets.push(["apk", app.apk]);
        for (const [kind, url] of targets) {
            const out = path.join(DEMO, "qr", `${kind}-${app.key}.png`);
            await QRCode.toFile(out, url, {
                errorCorrectionLevel: "M",
                margin: 1,
                width: 720,
                color: { dark: FOREST, light: WHITE },
            });
            console.log("wrote", path.relative(ROOT, out), "->", url);
        }
    }

    // Vendor the browser build for live-tunnel mode.
    const src = path.join(require.resolve("qrcode"), "..", "..", "build", "qrcode.min.js");
    if (fs.existsSync(src)) {
        fs.copyFileSync(src, path.join(DEMO, "vendor", "qrcode.min.js"));
        console.log("wrote frontend/web/public/demo/vendor/qrcode.min.js");
    } else {
        console.warn("  (qrcode browser build not found — live mode will fetch it or fall back)");
    }
})();
