/**
 * Repair apps/desktop/src/main/ipc/handlers.ts after bad import insertion:
 * - Fixes literal "\n" characters accidentally written into the source (e.g. ";\nimport ...")
 * - Removes stray/duplicate `import * as path from 'path';` lines
 * - Ensures exactly ONE correct `import * as path from 'path';` placed after `import fs from 'fs';`
 * - Repairs the specific broken pattern:
 *     import {
 *     import * as path from 'path';
 *       ...
 *     } from '../opencode';
 *
 * Usage:
 *   cd C:\Yandex.Disk\Project\RodjerHelp
 *   node scripts\fix-handlers-import-corruption-v3.js
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

// 1) If the file accidentally contains literal backslash-n sequences in the import header,
// convert them to real newlines ONLY in the first chunk to avoid touching strings later.
const HEAD_LEN = 8000;
const head = src.slice(0, HEAD_LEN);
const fixedHead = head.replace(/\\n/g, "\n");
if (fixedHead !== head) {
  src = fixedHead + src.slice(HEAD_LEN);
}

// 2) Repair broken pattern: "import {\\nimport * as path from 'path';\\n"
src = src.replace(
  /import\\s*\\{\\s*\\n\\s*import\\s+\\*\\s+as\\s+path\\s+from\\s+['"]path['"]\\s*;\\s*\\n/g,
  "import {\\n"
);

// 3) Remove ALL existing path-import lines (we will re-add exactly one in the right place)
src = src.replace(/^\\s*import\\s+\\*\\s+as\\s+path\\s+from\\s+['"]path['"]\\s*;\\s*\\r?\\n/gm, "");

// 4) Ensure fs import exists (it does in your project); insert path import right after it
if (/^import\\s+fs\\s+from\\s+['"]fs['"]\\s*;\\s*$/m.test(src)) {
  src = src.replace(
    /^import\\s+fs\\s+from\\s+['"]fs['"]\\s*;\\s*\\r?\\n/m,
    (m) => m + "import * as path from 'path';\\n"
  );
} else {
  // Fallback: insert after the first import line
  src = src.replace(/^(import[^\\n]*\\r?\\n)/, "$1import * as path from 'path';\\n");
}

// 5) Sanity: ensure no stray "import" lines inside an import-block
src = src.replace(/import\\s*\\{\\s*\\n(?:\\s*import[^\\n]*\\n)+/g, "import {\\n");

fs.writeFileSync(filePath, src, "utf8");
console.log("✅ handlers.ts repaired:", filePath);
