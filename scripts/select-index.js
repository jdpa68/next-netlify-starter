// scripts/select-index.js
// If APP_MODE=assistant, copy the public app homepage into place before build.

const fs = require("fs");
const path = require("path");

const mode = (process.env.APP_MODE || "").toLowerCase();
const src = path.join(__dirname, "..", "pages_app", "index.js");
const dest = path.join(__dirname, "..", "pages", "index.js");

if (mode === "assistant") {
  if (!fs.existsSync(src)) {
    console.error("[select-index] Missing pages_app/index.js — cannot build assistant app.");
    process.exit(1);
  }
  try {
    fs.copyFileSync(src, dest);
    console.log("[select-index] APP_MODE=assistant → copied pages_app/index.js → pages/index.js");
  } catch (e) {
    console.error("[select-index] Copy failed:", e.message);
    process.exit(1);
  }
} else {
  console.log("[select-index] APP_MODE!=assistant → leaving console index.js as-is");
}
