/**
 * Fix TypeScript errors in PermissionDialog.tsx caused by window custom fields and Element.click typing.
 *
 * What it fixes:
 * - window.rodjerhelpExtras -> casts window to any
 * - window.accomplish.getLastPickedChatFiles -> casts accomplish to any
 * - window.getLastPickedChatFiles -> casts window to any
 * - option.click() on Element -> casts option to HTMLElement
 *
 * Usage:
 *   cd C:\Yandex.Disk\Project\RodjerHelp
 *   node scripts\fix-permissiondialog-ts-v9.js
 *   pnpm -F @accomplish/desktop build:base
 */
const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
const filePath = path.join(ROOT, "apps", "web", "src", "client", "components", "execution", "PermissionDialog.tsx");

if (!fs.existsSync(filePath)) {
  console.error("PermissionDialog.tsx not found:", filePath);
  process.exit(1);
}

let src = fs.readFileSync(filePath, "utf8");
const original = src;

// Replace typed window usage inside v7 block with any-cast
src = src.replace(/const w = window;\n/g, "const w = window as any;\n");

// Replace candidates array if still strongly typed
src = src.replace(
  /const candidates = \[\n\s*w && w\.rodjerhelpExtras && w\.rodjerhelpExtras\.getLastPickedChatFiles,\n\s*w && w\.accomplish && w\.accomplish\.getLastPickedChatFiles,\n\s*w && w\.getLastPickedChatFiles,\n\s*\];/m,
  "const candidates = [\n          w && w.rodjerhelpExtras && w.rodjerhelpExtras.getLastPickedChatFiles,\n          w && w.accomplish && w.accomplish.getLastPickedChatFiles,\n          w && w.getLastPickedChatFiles,\n        ] as any[];"
);

// Cast clickable option
src = src.replace(/if \(option\) option\.click\(\);/g, "if (option) (option as HTMLElement).click();");

// In case option is declared without cast, make query result effectively HTMLElement-friendly
src = src.replace(
  /\.find\(\(el\) => \/\(excel\|csv\|файл\)\//g,
  ".find((el) => /(excel|csv|файл)/"
);

// Also patch the error dialog option click
src = src.replace(
  /\.find\(\(el\) => want\.test\(\(el\.textContent \|\| ''\)\.trim\(\)\)\);/g,
  ".find((el) => want.test((el.textContent || '').trim())) as HTMLElement | undefined;"
);

// And the data/source dialog option
src = src.replace(
  /\.find\(\(el\) => \/\(excel\|csv\|файл\)\/i\.test\(\(el\.textContent \|\| ''\)\.trim\(\)\)\);/g,
  ".find((el) => /(excel|csv|файл)/i.test((el.textContent || '').trim())) as HTMLElement | undefined;"
);

// Make sure the specific option declarations are typed
src = src.replace(/const option =\n/g, "const option =\n");
src = src.replace(/const optionEl =\n/g, "const optionEl =\n");

// Fallback: if still using bare window.accomplish in file, cast it
src = src.replace(/window\.accomplish\.getLastPickedChatFiles/g, "(window as any).accomplish.getLastPickedChatFiles");
src = src.replace(/window\.rodjerhelpExtras/g, "(window as any).rodjerhelpExtras");
src = src.replace(/window\.getLastPickedChatFiles/g, "(window as any).getLastPickedChatFiles");

if (src === original) {
  console.log("No changes were necessary.");
} else {
  fs.writeFileSync(filePath, src, "utf8");
  console.log("✅ Fixed PermissionDialog.tsx typing issues:", filePath);
}
