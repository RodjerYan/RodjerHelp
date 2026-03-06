/**
 * Fix TS2304: Cannot find name 'path' in apps/desktop/src/main/ipc/handlers.ts
 *
 * Usage:
 *   cd C:\Yandex.Disk\Project\RodjerHelp
 *   node scripts\fix-handlers-path-import.js
 *
 * Idempotent: safe to run multiple times.
 */
const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
const handlersPath = path.join(ROOT, "apps", "desktop", "src", "main", "ipc", "handlers.ts");

if (!fs.existsSync(handlersPath)) {
  console.error("handlers.ts not found:", handlersPath);
  process.exit(1);
}

let src = fs.readFileSync(handlersPath, "utf8");

if (/import\s+\*\s+as\s+path\s+from\s+['"]path['"]/.test(src)) {
  console.log("✅ handlers.ts already imports path");
  process.exit(0);
}

// Insert after the last existing import line, otherwise at file start.
const importBlockMatch = src.match(/^(import[^\n]*\n)+/m);
if (importBlockMatch) {
  src = src.replace(importBlockMatch[0], importBlockMatch[0] + "import * as path from 'path';\n");
} else {
  src = "import * as path from 'path';\n" + src;
}

fs.writeFileSync(handlersPath, src, "utf8");
console.log("✅ Added `import * as path from 'path';` to:", handlersPath);
