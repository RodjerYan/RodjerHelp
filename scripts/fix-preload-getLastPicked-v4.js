/**
 * Fix build errors in apps/desktop/src/preload/index.ts caused by bad insertion of getLastPickedChatFiles.
 *
 * Strategy (robust):
 * 1) Remove any `getLastPickedChatFiles:` property insertion inside preload (it currently breaks TS parsing).
 * 2) Expose a separate safe bridge object:
 *      contextBridge.exposeInMainWorld('rodjerhelpExtras', { getLastPickedChatFiles: () => ipcRenderer.invoke('chat:last-picked-files') })
 * 3) Update web code to use window.rodjerhelpExtras instead of window.accomplish for this function:
 *    - apps/web/src/client/components/execution/PermissionDialog.tsx (AUTO_FILE_QUESTION_V2 block)
 *    - apps/web/src/client/lib/rodjerhelp.ts (export getLastPickedChatFiles)
 *
 * Usage:
 *   cd C:\Yandex.Disk\Project\RodjerHelp
 *   node scripts/fix-preload-getLastPicked-v4.js
 *   pnpm -F @accomplish/desktop build:unpack
 */
const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();

const preloadPath = path.join(ROOT, 'apps', 'desktop', 'src', 'preload', 'index.ts');
const permPath = path.join(ROOT, 'apps', 'web', 'src', 'client', 'components', 'execution', 'PermissionDialog.tsx');
const apiPath = path.join(ROOT, 'apps', 'web', 'src', 'client', 'lib', 'rodjerhelp.ts');

function read(p){ return fs.readFileSync(p,'utf8'); }
function write(p,s){ fs.writeFileSync(p,s,'utf8'); }

function patchPreload() {
  if (!fs.existsSync(preloadPath)) throw new Error('preload not found: ' + preloadPath);
  let s = read(preloadPath);

  // 1) Remove any getLastPickedChatFiles property lines (object literal insertions)
  s = s.replace(/^\s*getLastPickedChatFiles\s*:\s*\(\)\s*=>[^\n]*\r?\n/gm, '');

  // 2) Remove any stray commas caused by removal (lines with only commas)
  s = s.replace(/^\s*,\s*\r?\n/gm, '');

  // 3) Ensure extras bridge exists once
  if (!s.includes("rodjerhelpExtras") || !s.includes("getLastPickedChatFiles")) {
    const bridge = `\n\n// rodjerhelpExtras bridge (attachments)\ncontextBridge.exposeInMainWorld('rodjerhelpExtras', {\n  getLastPickedChatFiles: () => ipcRenderer.invoke('chat:last-picked-files'),\n});\n`;
    // append near end (before last export/EOF)
    s = s.trimEnd() + bridge;
  }

  write(preloadPath, s);
  console.log('✅ preload fixed:', preloadPath);
}

function patchPermissionDialog() {
  if (!fs.existsSync(permPath)) { console.warn('PermissionDialog not found:', permPath); return; }
  let s = read(permPath);

  // In AUTO_FILE_QUESTION_V2 block, swap (window as any).accomplish -> (window as any).rodjerhelpExtras
  s = s.replace(/const\s+api\s*=\s*\(window\s+as\s+any\)\?\.\s*accomplish\s*;/g, "const api = (window as any)?.rodjerhelpExtras;");

  // Also handle other patterns if present
  s = s.replace(/\(window\s+as\s+any\)\?\.\s*accomplish/g, "(window as any)?.rodjerhelpExtras");

  write(permPath, s);
  console.log('✅ PermissionDialog updated to rodjerhelpExtras');
}

function patchRodjerhelp() {
  if (!fs.existsSync(apiPath)) throw new Error('rodjerhelp.ts not found: ' + apiPath);
  let s = read(apiPath);

  // Replace getLastPickedChatFiles implementation to use rodjerhelpExtras
  const reImpl = /export\s+const\s+getLastPickedChatFiles\s*=\s*async\s*\(\)\s*:\s*Promise<string\[\]>\s*=>\s*\{[\s\S]*?\n\};\s*\n/m;
  const impl = "export const getLastPickedChatFiles = async (): Promise<string[]> => {\n  const extras = (window as any)?.rodjerhelpExtras;\n  if (!extras?.getLastPickedChatFiles) return [];\n  return extras.getLastPickedChatFiles();\n};\n";
  if (reImpl.test(s)) {
    s = s.replace(reImpl, impl);
  } else if (!s.includes("export const getLastPickedChatFiles")) {
    s += "\n" + impl;
  }

  // Remove RodjerHelpAPI getLastPickedChatFiles typing if it was added (no longer needed)
  s = s.replace(/\n\s*getLastPickedChatFiles\?\s*:\s*\(\)\s*=>\s*Promise<string\[\]>\s*;\s*\n/g, "\n");

  write(apiPath, s);
  console.log('✅ rodjerhelp.ts updated to rodjerhelpExtras');
}

try {
  patchPreload();
  patchPermissionDialog();
  patchRodjerhelp();
  console.log('✅ Done. Now rebuild: pnpm -F @accomplish/desktop build:unpack');
} catch (e) {
  console.error('Patch failed:', e);
  process.exit(1);
}
