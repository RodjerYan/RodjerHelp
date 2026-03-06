/**
 * Fix TS2339: getLastPickedChatFiles does not exist on type RodjerHelpAPI
 *
 * Adds a merged interface declaration in apps/web/src/client/lib/rodjerhelp.ts:
 *   export interface RodjerHelpAPI {
 *     getLastPickedChatFiles?: () => Promise<string[]>;
 *   }
 *
 * Usage:
 *   cd C:\Yandex.Disk\Project\RodjerHelp
 *   node scripts\fix-rodjerhelp-typing-v2.js
 */
const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
const apiPath = path.join(ROOT, "apps", "web", "src", "client", "lib", "rodjerhelp.ts");

if (!fs.existsSync(apiPath)) {
  console.error("rodjerhelp.ts not found:", apiPath);
  process.exit(1);
}

let src = fs.readFileSync(apiPath, "utf8");

if (/getLastPickedChatFiles\\s*\\?\\s*:\\s*\\(\\)\\s*=>\\s*Promise<\\s*string\\[\\]\\s*>/.test(src)) {
  console.log("✅ rodjerhelp.ts already contains getLastPickedChatFiles typing");
  process.exit(0);
}

// Add declaration merge at end of file (TypeScript interface merging)
src += `\n\n// --- RodjerHelpAPI typing extension (attachments) ---\nexport interface RodjerHelpAPI {\n  getLastPickedChatFiles?: () => Promise<string[]>;\n}\n`;

fs.writeFileSync(apiPath, src, "utf8");
console.log("✅ Added RodjerHelpAPI merged typing for getLastPickedChatFiles:", apiPath);
