/**
 * Fix TS2395/TS2339 in apps/web/src/client/lib/rodjerhelp.ts:
 * - Ensure RodjerHelpAPI is consistently exported (no mixed local/exported merged declarations)
 * - Ensure RodjerHelpAPI includes getLastPickedChatFiles?: () => Promise<string[]>
 * - Remove the previously appended "typing extension" block if present
 *
 * Usage:
 *   cd C:\Yandex.Disk\Project\RodjerHelp
 *   node scripts\fix-rodjerhelp-typing-v3.js
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

// 1) Remove our previously appended merge block (if any)
src = src.replace(
  /\n\/\/ --- RodjerHelpAPI typing extension \(attachments\) ---[\s\S]*?export interface RodjerHelpAPI\s*\{[\s\S]*?\}\s*\n?/g,
  "\n"
);

// 2) Find the first (original) RodjerHelpAPI interface declaration
const reIface = /(export\s+)?interface\s+RodjerHelpAPI\s*\{/;
const m = src.match(reIface);
if (!m) {
  console.error("Could not find interface RodjerHelpAPI in rodjerhelp.ts");
  process.exit(2);
}

// 3) Ensure it's exported
src = src.replace(reIface, "export interface RodjerHelpAPI {");

// 4) Ensure it contains getLastPickedChatFiles typing
if (!/getLastPickedChatFiles\s*\?\s*:\s*\(\)\s*=>\s*Promise<\s*string\[\]\s*>/.test(src)) {
  const startIdx = src.indexOf("export interface RodjerHelpAPI {");
  const braceStart = src.indexOf("{", startIdx);
  let depth = 0;
  let endIdx = -1;
  for (let i = braceStart; i < src.length; i++) {
    const ch = src[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) { endIdx = i; break; }
    }
  }
  if (endIdx === -1) {
    console.error("Could not parse RodjerHelpAPI interface block");
    process.exit(3);
  }
  const insert = "\n  getLastPickedChatFiles?: () => Promise<string[]>;\n";
  src = src.slice(0, endIdx) + insert + src.slice(endIdx);
}

fs.writeFileSync(apiPath, src, "utf8");
console.log("✅ Fixed RodjerHelpAPI export + typing, removed duplicate merge block:", apiPath);
