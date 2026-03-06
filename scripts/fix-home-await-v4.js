/**
 * Fix Home.tsx build error TS1308 caused by accidental insertion of `await buildPromptWithAttachments(...)`
 * into non-async code (use case definitions).
 *
 * Reverts `prompt: await buildPromptWithAttachments(t)(...)` back to `prompt: t(...)`.
 *
 * Usage:
 *   cd C:\Yandex.Disk\Project\RodjerHelp
 *   node scripts\fix-home-await-v4.js
 *   pnpm -F @accomplish/desktop build:unpack
 */
const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
const homePath = path.join(ROOT, "apps", "web", "src", "client", "pages", "Home.tsx");

if (!fs.existsSync(homePath)) {
  console.error("Home.tsx not found:", homePath);
  process.exit(1);
}

let src = fs.readFileSync(homePath, "utf8");

const reBad = /prompt\\s*:\\s*await\\s+buildPromptWithAttachments\\s*\\(\\s*t\\s*\\)\\s*\\(\\s*([^\\)]*?)\\s*\\)/g;
src = src.replace(reBad, (_m, inner) => "prompt: t(" + inner + ")");

fs.writeFileSync(homePath, src, "utf8");
console.log("✅ Fixed Home.tsx bad await wrapping in use-cases");
