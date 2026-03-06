/**
 * Fix corrupted import block in apps/desktop/src/main/ipc/handlers.ts
 *
 * Problem signs:
 * - first line contains literal "\n" text:
 *     import * as path from 'path';\nimport crypto from 'crypto';
 * - duplicate `import * as path from 'path';` inserted inside another import block
 *
 * What this script does:
 * 1) removes the broken first line with literal \n
 * 2) removes all duplicate `import * as path from 'path';`
 * 3) ensures the file starts with exactly:
 *      import crypto from 'crypto';
 *      import * as path from 'path';
 *
 * Usage:
 *   cd C:\Yandex.Disk\Project\RodjerHelp
 *   node scripts\fix-handlers-ts-imports.js
 *   pnpm -F @accomplish/desktop build:base
 */
const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
const filePath = path.join(ROOT, "apps", "desktop", "src", "main", "ipc", "handlers.ts");

if (!fs.existsSync(filePath)) {
  console.error("handlers.ts not found:", filePath);
  process.exit(1);
}

let src = fs.readFileSync(filePath, "utf8");
const original = src;

// Remove UTF BOM if present
src = src.replace(/^\uFEFF/, "");

// Remove exactly broken first-line pattern with literal \n
src = src.replace(
  /^import \* as path from 'path';\\nimport crypto from 'crypto';\r?\n?/,
  ""
);

// Remove ALL standalone path imports; we'll re-add one clean copy
src = src.replace(/^\s*import \* as path from 'path';\r?\n/gm, "");

// Ensure crypto import exists only once
src = src.replace(/^\s*import crypto from 'crypto';\r?\n/gm, "");
src = "import crypto from 'crypto';\nimport * as path from 'path';\n" + src.trimStart();

// Safety cleanup: collapse accidental triple blank lines at top
src = src.replace(/^(?:\s*\n){3,}/, "\n\n");

if (src === original) {
  console.log("No changes were necessary.");
} else {
  fs.writeFileSync(filePath, src, "utf8");
  console.log("✅ Fixed handlers.ts import block:", filePath);
}
