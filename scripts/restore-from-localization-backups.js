/**
 * Restore files from .bak backups created by apply-russian-localization.js
 * Then remove generated .bak files.
 *
 * Usage:
 *   cd C:\Yandex.Disk\Project\RodjerHelp
 *   node scripts\restore-from-localization-backups.js
 */
const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === "node_modules" || ent.name === ".git") continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const files = walk(ROOT).filter((p) => p.endsWith(".bak"));
let restored = 0;

for (const bak of files) {
  const original = bak.slice(0, -4);
  try {
    fs.copyFileSync(bak, original);
    restored++;
  } catch (e) {
    console.error("Failed to restore:", bak, "->", original, e.message);
  }
}

console.log("Restored files:", restored);
console.log("Done.");
