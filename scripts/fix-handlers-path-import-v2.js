/**
 * Fix handlers.ts broken import insertion (TS1003 etc.) and ensure proper `path` import.
 *
 * Repairs cases like:
 *   import fs from 'fs';
 *   import {
 *   import * as path from 'path';
 *     ...
 *   } from '../opencode';
 *
 * Usage:
 *   cd C:\Yandex.Disk\Project\RodjerHelp
 *   node scripts\fix-handlers-path-import-v2.js
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

// 1) Fix the specific broken pattern: "import {\\nimport * as path ..."
src = src.replace(
  /import\\s*\\{\\s*\\n\\s*import\\s+\\*\\s+as\\s+path\\s+from\\s+['"]path['"]\\s*;\\s*\\n/g,
  "import {\\n"
);

// 2) Remove any stray `import * as path from 'path';` that ended up in the middle of import blocks.
src = src.replace(/^\\s*import\\s+\\*\\s+as\\s+path\\s+from\\s+['"]path['"]\\s*;\\s*\\r?\\n/gm, "");

// 3) Ensure we have exactly one proper path import near the top (after fs import if present).
if (!/import\\s+\\*\\s+as\\s+path\\s+from\\s+['"]path['"]/.test(src)) {
  const fsImport = src.match(/^import\\s+fs\\s+from\\s+['"]fs['"]\\s*;\\s*\\r?\\n/m);
  if (fsImport) {
    src = src.replace(fsImport[0], fsImport[0] + "import * as path from 'path';\\n");
  } else {
    const importBlock = src.match(/^(import[^\\n]*\\r?\\n)+/m);
    if (importBlock) {
      src = src.replace(importBlock[0], importBlock[0] + "import * as path from 'path';\\n");
    } else {
      src = "import * as path from 'path';\\n" + src;
    }
  }
}

fs.writeFileSync(filePath, src, "utf8");
console.log("✅ Fixed handlers.ts imports and ensured path import:", filePath);
