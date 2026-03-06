/**
 * v7 fix:
 * - taskStore.ts: make picked files visible in prompt for BOTH startTask and sendFollowUp
 * - PermissionDialog.tsx: auto-answer dialogs if picked files exist:
 *   * Данные / Источник -> choose Excel/CSV/Файл
 *   * Файл -> paste first path
 *   * Ошибка -> choose "скрин/фото" for images, otherwise "текст ошибки"
 *
 * Usage:
 *   cd C:\Yandex.Disk\Project\RodjerHelp
 *   node scripts\apply-attachments-and-dialogs-v7-fix.js
 *   pnpm -F @accomplish/desktop build:base
 */
const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
const taskStorePath = path.join(ROOT, "apps", "web", "src", "client", "stores", "taskStore.ts");
const permissionDialogPath = path.join(ROOT, "apps", "web", "src", "client", "components", "execution", "PermissionDialog.tsx");

function read(p){ return fs.readFileSync(p, "utf8"); }
function write(p, s){ fs.writeFileSync(p, s, "utf8"); }

function ensureUseEffectImport(tsx) {
  const re1 = /import\s+React,\s*\{\s*([^}]*)\s*\}\s*from\s*['"]react['"];/;
  const re2 = /import\s+\{\s*([^}]*)\s*\}\s*from\s*['"]react['"];/;
  if (re1.test(tsx)) {
    return tsx.replace(re1, (m, inner) =>
      inner.indexOf("useEffect") >= 0 ? m :
      "import React, { " + inner.trim().replace(/\s*,\s*$/, "") + ", useEffect } from 'react';"
    );
  }
  if (re2.test(tsx)) {
    return tsx.replace(re2, (m, inner) =>
      inner.indexOf("useEffect") >= 0 ? m :
      "import { " + inner.trim().replace(/\s*,\s*$/, "") + ", useEffect } from 'react';"
    );
  }
  if (tsx.indexOf("useEffect") === -1) return "import { useEffect } from 'react';\n" + tsx;
  return tsx;
}

function patchTaskStore() {
  if (!fs.existsSync(taskStorePath)) {
    console.error("taskStore.ts not found:", taskStorePath);
    process.exit(1);
  }
  let src = read(taskStorePath);

  if (!src.includes("ATTACHMENTS_TASKSTORE_V7")) {
    const helper =
"\n\n// ATTACHMENTS_TASKSTORE_V7\n" +
"const __getPickedFilesV7 = async (): Promise<string[]> => {\n" +
"  try {\n" +
"    const w = window;\n" +
"    const candidates = [\n" +
"      w && w.rodjerhelpExtras && w.rodjerhelpExtras.getLastPickedChatFiles,\n" +
"      w && w.accomplish && w.accomplish.getLastPickedChatFiles,\n" +
"      w && w.getLastPickedChatFiles,\n" +
"    ];\n" +
"    for (const getter of candidates) {\n" +
"      if (typeof getter === 'function') {\n" +
"        const val = await getter();\n" +
"        const arr = Array.isArray(val) ? val.filter(Boolean).map(String) : [];\n" +
"        if (arr.length) return arr;\n" +
"      }\n" +
"    }\n" +
"  } catch (e) {\n" +
"    console.warn('[ATTACHMENTS_TASKSTORE_V7/getter] failed', e);\n" +
"  }\n" +
"  return [];\n" +
"};\n\n" +
"const __augmentPromptWithPickedFilesV7 = async (text: string): Promise<string> => {\n" +
"  try {\n" +
"    if (typeof text !== 'string') return text as any;\n" +
"    const paths = await __getPickedFilesV7();\n" +
"    if (!paths.length) return text;\n" +
"    if (text.indexOf('📎 Вложения:') >= 0) return text;\n" +
"    const names = paths.map((p) => (String(p).split(/[\\\\/]/).pop() || String(p))).slice(0, 10);\n" +
"    const more = paths.length > 10 ? (' +' + String(paths.length - 10)) : '';\n" +
"    const header = '📎 Вложения: ' + names.join(', ') + more;\n" +
"    const pathBlock = '\\n\\n[Attached file paths]\\n' + paths.map((p) => '- ' + p).join('\\n') + '\\n\\nUse these paths directly. Do NOT ask me to provide the path again.';\n" +
"    return header + '\\n' + text + pathBlock;\n" +
"  } catch (e) {\n" +
"    console.warn('[ATTACHMENTS_TASKSTORE_V7/augment] failed', e);\n" +
"    return text;\n" +
"  }\n" +
"};\n";

    const imports = src.match(/^(?:import[^\n]*\n)+/m);
    if (imports) {
      src = imports[0] + helper + src.slice(imports[0].length);
    } else {
      src = helper + src;
    }
  }

  // Patch startTask: async (config: TaskConfig) => {
  if (src.includes("startTask: async (config: TaskConfig) => {") && !src.includes("ATTACHMENTS_TASKSTORE_V7_START")) {
    src = src.replace(
      "startTask: async (config: TaskConfig) => {",
      "startTask: async (config: TaskConfig) => {\n\n    // ATTACHMENTS_TASKSTORE_V7_START\n    config = { ...config, prompt: await __augmentPromptWithPickedFilesV7(config.prompt) };"
    );
  }

  // Patch sendFollowUp message before userMessage creation and resumeSession call
  if (src.includes("sendFollowUp: async (message: string) => {") && !src.includes("ATTACHMENTS_TASKSTORE_V7_FOLLOWUP")) {
    src = src.replace(
      "sendFollowUp: async (message: string) => {",
      "sendFollowUp: async (message: string) => {\n    // ATTACHMENTS_TASKSTORE_V7_FOLLOWUP\n    message = await __augmentPromptWithPickedFilesV7(message);"
    );
  }

  write(taskStorePath, src);
  console.log("✅ patched taskStore.ts:", taskStorePath);
}

function patchPermissionDialog() {
  if (!fs.existsSync(permissionDialogPath)) {
    console.warn("PermissionDialog.tsx not found:", permissionDialogPath);
    return;
  }
  let src = read(permissionDialogPath);
  src = ensureUseEffectImport(src);

  if (!src.includes("AUTO_DIALOGS_WITH_FILES_V7")) {
    const block =
"\n  // AUTO_DIALOGS_WITH_FILES_V7\n" +
"  useEffect(() => {\n" +
"    (async () => {\n" +
"      try {\n" +
"        const w = window;\n" +
"        const candidates = [\n" +
"          w && w.rodjerhelpExtras && w.rodjerhelpExtras.getLastPickedChatFiles,\n" +
"          w && w.accomplish && w.accomplish.getLastPickedChatFiles,\n" +
"          w && w.getLastPickedChatFiles,\n" +
"        ];\n" +
"        let paths = [] as string[];\n" +
"        for (const getter of candidates) {\n" +
"          if (typeof getter === 'function') {\n" +
"            const val = await getter();\n" +
"            const arr = Array.isArray(val) ? val.filter(Boolean).map(String) : [];\n" +
"            if (arr.length) { paths = arr; break; }\n" +
"          }\n" +
"        }\n" +
"        if (!paths.length) return;\n" +
"        const firstPath = paths[0];\n" +
"        const title = (document.querySelector('h1,h2,h3,[role=\"heading\"]')?.textContent || '').trim();\n" +
"\n" +
"        const buttons = Array.from(document.querySelectorAll('button'));\n" +
"        const submitBtn = buttons.find((b) => /submit/i.test(b.textContent || '') || /отправ/i.test(b.textContent || '')) || null;\n" +
"\n" +
"        if (/(данные|источник)/i.test(title)) {\n" +
"          const option = Array.from(document.querySelectorAll('button, [role=\"button\"], [data-radix-collection-item]')).find((el) => /(excel|csv|файл)/i.test((el.textContent || '').trim()));\n" +
"          if (option) option.click();\n" +
"          if (submitBtn) submitBtn.click();\n" +
"          return;\n" +
"        }\n" +
"\n" +
"        if (/файл/i.test(title)) {\n" +
"          const input = document.querySelector('input[type=\"text\"], input') as HTMLInputElement | null;\n" +
"          if (input) {\n" +
"            input.focus();\n" +
"            input.value = firstPath;\n" +
"            input.dispatchEvent(new Event('input', { bubbles: true }));\n" +
"            input.dispatchEvent(new Event('change', { bubbles: true }));\n" +
"          }\n" +
"          if (submitBtn) submitBtn.click();\n" +
"          return;\n" +
"        }\n" +
"\n" +
"        if (/ошибка/i.test(title)) {\n" +
"          const isImage = /\\.(png|jpg|jpeg|webp|gif|bmp)$/i.test(firstPath);\n" +
"          const want = isImage ? /(скрин|фото|изображ)/i : /(текст|stack|trace|ошибк)/i;\n" +
"          const option = Array.from(document.querySelectorAll('button, [role=\"button\"], [data-radix-collection-item]')).find((el) => want.test((el.textContent || '').trim()));\n" +
"          if (option) option.click();\n" +
"          if (submitBtn) submitBtn.click();\n" +
"          return;\n" +
"        }\n" +
"      } catch (e) {\n" +
"        console.warn('[AUTO_DIALOGS_WITH_FILES_V7] failed', e);\n" +
"      }\n" +
"    })();\n" +
"  }, []);\n";

    const idx = src.indexOf("const [");
    if (idx !== -1) {
      const after = src.indexOf("\n", idx);
      src = src.slice(0, after + 1) + block + src.slice(after + 1);
    } else {
      const f = src.indexOf("{", src.indexOf("function"));
      src = (f !== -1) ? (src.slice(0, f + 1) + block + src.slice(f + 1)) : (block + src);
    }
  }

  write(permissionDialogPath, src);
  console.log("✅ patched PermissionDialog.tsx:", permissionDialogPath);
}

patchTaskStore();
patchPermissionDialog();
console.log("✅ v7 fix applied. Rebuild with: pnpm -F @accomplish/desktop build:base");
