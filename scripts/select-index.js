// scripts/select-index.js
// Copies working pages from /pages_app to /pages before Netlify build.
// Ensures both index.js and register.js exist in the final build folder.

import fs from "fs";
import path from "path";

const root = process.cwd();
const srcDir = path.join(root, "pages_app");
const destDir = path.join(root, "pages");

// Ensure /pages exists
if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

// Files we always want in /pages
const filesToCopy = ["index.js", "register.js"];

for (const file of filesToCopy) {
  const src = path.join(srcDir, file);
  const dest = path.join(destDir, file);

  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
    console.log(`✅ Copied ${file} to /pages`);
  } else {
    console.warn(`⚠️  Skipped ${file} (not found in /pages_app)`);
  }
}
