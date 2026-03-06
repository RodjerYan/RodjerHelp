/**
 * Fix broken header/comment in apps/desktop/src/preload/index.ts
 *
 * Current error:
 *   src/preload/index.ts:5 Unexpected keyword or identifier
 * because the file contains broken text like:
 *   ctron main process via IPC.
 *    */
 *
 * This script:
 * 1) removes the malformed stray header fragment at the top of preload/index.ts
 * 2) inserts a clean valid comment block after the import lines
 *
 * Usage:
 *   cd C:\Yandex.Disk\Project\RodjerHelp
 *   node scripts\fix-preload-header-v12.js
 *   pnpm -F @accomplish/desktop build:base
 */
const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
const filePath = path.join(ROOT, "apps", "desktop", "src", "preload", "index.ts");

if (!fs.existsSync(filePath)) {
  console.error("preload index.ts not found:", filePath);
  process.exit(1);
}

let src = fs.readFileSync(filePath, "utf8");
const original = src;

// Remove BOM
src = src.replace(/^\uFEFF/, "");

// Remove malformed stray fragment near the top if present
src = src.replace(/^\s*ctron main process via IPC\.\r?\n\s*\*\/\r?\n/m, "");

// Remove any malformed partial comment directly after imports
src = src.replace(/(\r?\n){0,2}\s*ctron main process via IPC\.\r?\n\s*\*\/\r?\n/, "\n");

// Ensure there is a sane header comment after imports
const header = `/**\n * Exposes a limited API to the renderer process.\n * All privileged operations are routed to the Electron main process via IPC.\n */\n`;

const importBlockMatch = src.match(/^(?:import[^\n]*\n)+/);
if (importBlockMatch) {
  const imports = importBlockMatch[0];
  let rest = src.slice(imports.length);

  // Remove an existing immediately-following comment block if it is broken or duplicated
  rest = rest.replace(/^\s*\/\*\*[\s\S]*?\*\/\s*/m, (m) => {
    if (m.includes("renderer process") || m.includes("main process via IPC") || m.includes("ctron main process")) {
      return "";
    }
    return m;
  });

  src = imports + "\n" + header + rest.replace(/^\s+/, "");
} else {
  // Fallback: just prepend the header if imports weren't matched
  if (!src.includes("Exposes a limited API to the renderer process")) {
    src = header + src;
  }
}

if (src !== original) {
  fs.writeFileSync(filePath, src, "utf8");
  console.log("✅ Fixed preload header:", filePath);
} else {
  console.log("No changes were necessary.");
}
