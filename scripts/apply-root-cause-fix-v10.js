/**
 * v10 root-cause fix
 *
 * Targets:
 * 1) apps/desktop/src/preload/index.ts
 *    - cache picked chat files in preload
 *    - expose getLastPickedChatFiles through window.accomplish
 *
 * 2) apps/web/src/client/stores/taskStore.ts
 *    - remove old V6/V7 helper blocks
 *    - augment BOTH startTask and sendFollowUp prompts with:
 *      * visible header: "📎 Вложения: ..."
 *      * absolute file paths
 *      * file contents if readChatFiles exists
 *
 * 3) apps/web/src/client/components/execution/PermissionDialog.tsx
 *    - auto-answer dialogs when attachment exists:
 *      * Данные/Источник -> Excel/CSV/Файл
 *      * Файл -> path
 *      * Ошибка -> скрин/фото for images, otherwise текст ошибки
 *      * Уточнение -> prefer "Бренд/модель"
 *
 * 4) safe exact-string RU patch for visible leftovers:
 *      Loading agent...
 *      or type your own
 *      read
 *
 * Usage:
 *   cd C:\Yandex.Disk\Project\RodjerHelp
 *   node scripts\apply-root-cause-fix-v10.js
 *   pnpm -F @accomplish/desktop build:base
 */
const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();

function read(p){ return fs.readFileSync(p,"utf8"); }
function write(p,s){ fs.writeFileSync(p,s,"utf8"); }
function exists(p){ return fs.existsSync(p); }
function walk(dir, out=[]) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === "node_modules" || ent.name === "dist" || ent.name === "release" || ent.name === ".git") continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

function patchPreload() {
  const p = path.join(ROOT, "apps", "desktop", "src", "preload", "index.ts");
  if (!exists(p)) { console.warn("preload not found:", p); return; }
  let s = read(p);

  // remove previous cache/getter lines if any
  s = s.replace(/^\s*let __pickedChatFilesCache[\s\S]*?;\s*$/gm, "");
  s = s.replace(/^\s*getLastPickedChatFiles:\s*async\s*\(\)\s*=>[^\n]*\n/gm, "");

  // add cache var after imports
  if (!s.includes("__pickedChatFilesCache")) {
    const imports = s.match(/^(?:import[^\n]*\n)+/m);
    const block = "\nlet __pickedChatFilesCache: any[] = [];\n";
    if (imports) s = imports[0] + block + s.slice(imports[0].length);
    else s = block + s;
  }

  // patch pickChatFiles if exact property exists
  if (s.includes("pickChatFiles: () => ipcRenderer.invoke('chat:pick-files')")) {
    s = s.replace(
      "pickChatFiles: () => ipcRenderer.invoke('chat:pick-files')",
      "pickChatFiles: async () => { const res = await ipcRenderer.invoke('chat:pick-files'); __pickedChatFilesCache = Array.isArray(res) ? res : []; return res; }"
    );
  } else if (s.includes('pickChatFiles: () => ipcRenderer.invoke("chat:pick-files")')) {
    s = s.replace(
      'pickChatFiles: () => ipcRenderer.invoke("chat:pick-files")',
      'pickChatFiles: async () => { const res = await ipcRenderer.invoke("chat:pick-files"); __pickedChatFilesCache = Array.isArray(res) ? res : []; return res; }'
    );
  } else if (s.includes("pickChatFiles: async () => ipcRenderer.invoke('chat:pick-files')")) {
    s = s.replace(
      "pickChatFiles: async () => ipcRenderer.invoke('chat:pick-files')",
      "pickChatFiles: async () => { const res = await ipcRenderer.invoke('chat:pick-files'); __pickedChatFilesCache = Array.isArray(res) ? res : []; return res; }"
    );
  }

  // add getter next to pickChatFiles if not present
  if (!s.includes("getLastPickedChatFiles: async () =>")) {
    s = s.replace(/pickChatFiles:\s*async\s*\(\)\s*=>\s*\{[^\n]*\n/g, (m) => m + "    getLastPickedChatFiles: async () => __pickedChatFilesCache.map((f: any) => typeof f === 'string' ? f : (f?.path || '')).filter(Boolean),\n");
    if (!s.includes("getLastPickedChatFiles: async () =>")) {
      // fallback: append inside first exposed object
      s = s.replace(/contextBridge\.exposeInMainWorld\(\s*['"]accomplish['"]\s*,\s*\{/,
        "contextBridge.exposeInMainWorld('accomplish', {\n  getLastPickedChatFiles: async () => __pickedChatFilesCache.map((f: any) => typeof f === 'string' ? f : (f?.path || '')).filter(Boolean),");
    }
  }

  write(p, s);
  console.log("✅ patched preload:", p);
}

function patchTaskStore() {
  const p = path.join(ROOT, "apps", "web", "src", "client", "stores", "taskStore.ts");
  if (!exists(p)) { console.warn("taskStore not found:", p); return; }
  let s = read(p);

  // remove old helper blocks V6/V7
  s = s.replace(/\n\s*\/\/ ATTACHMENTS_TASKSTORE_V6[\s\S]*?\n\s*\};\n/m, "\n");
  s = s.replace(/\n\s*\/\/ ATTACHMENTS_TASKSTORE_V7[\s\S]*?const __augmentPromptWithPickedFilesV7 = async \(text: string\): Promise<string> => \{[\s\S]*?\n\};\n/m, "\n");

  // remove old start/followup patch comments
  s = s.replace(/\n\s*\/\/ ATTACHMENTS_TASKSTORE_V7_START[^\n]*\n\s*config = \{ \.\.\.config, prompt: await __augmentPromptWithPickedFilesV7\(config\.prompt\) \};/m, "");
  s = s.replace(/\n\s*\/\/ ATTACHMENTS_TASKSTORE_V7_FOLLOWUP[^\n]*\n\s*message = await __augmentPromptWithPickedFilesV7\(message\);/m, "");
  s = s.replace(/\n\s*\/\/ ATTACHMENTS_TASKSTORE_V6[\s\S]*?catch \(e\) \{\n\s*console\.warn\('[^']*', e\);\n\s*\}\n/m, "\n");

  if (!s.includes("ATTACHMENTS_TASKSTORE_V10")) {
    const helper =
"\n\n// ATTACHMENTS_TASKSTORE_V10\n" +
"const __getPickedFilesV10 = async (): Promise<string[]> => {\n" +
"  try {\n" +
"    const w = window as any;\n" +
"    const candidates = [\n" +
"      w?.accomplish?.getLastPickedChatFiles,\n" +
"      w?.rodjerhelpExtras?.getLastPickedChatFiles,\n" +
"      w?.getLastPickedChatFiles,\n" +
"    ];\n" +
"    for (const getter of candidates) {\n" +
"      if (typeof getter === 'function') {\n" +
"        const val = await getter();\n" +
"        const arr = Array.isArray(val) ? val.filter(Boolean).map(String) : [];\n" +
"        if (arr.length) return arr;\n" +
"      }\n" +
"    }\n" +
"  } catch (e) {\n" +
"    console.warn('[ATTACHMENTS_TASKSTORE_V10/getter] failed', e);\n" +
"  }\n" +
"  return [];\n" +
"};\n\n" +
"const __augmentPromptWithPickedFilesV10 = async (text: string): Promise<string> => {\n" +
"  try {\n" +
"    if (typeof text !== 'string') return text as any;\n" +
"    if (text.includes('📎 Вложения:')) return text;\n" +
"    const paths = await __getPickedFilesV10();\n" +
"    if (!paths.length) return text;\n" +
"    const names = paths.map((p) => (String(p).split(/[\\\\/]/).pop() || String(p))).slice(0, 10);\n" +
"    const more = paths.length > 10 ? (' +' + String(paths.length - 10)) : '';\n" +
"    const header = '📎 Вложения: ' + names.join(', ') + more;\n" +
"    let fileBlock = '\\n\\n[Attached file paths]\\n' + paths.map((p) => '- ' + p).join('\\n') + '\\n';\n" +
"    try {\n" +
"      const api = getRodjerHelp() as any;\n" +
"      if (api && typeof api.readChatFiles === 'function') {\n" +
"        const files = await api.readChatFiles(paths);\n" +
"        if (Array.isArray(files) && files.length) {\n" +
"          fileBlock += '\\n[Attached file contents]\\n' + files.map((f: any) => {\n" +
"            const fp = f?.path || '';\n" +
"            const nm = f?.name || (String(fp).split(/[\\\\/]/).pop() || 'file');\n" +
"            const txt = typeof f?.text === 'string' ? f.text : '';\n" +
"            return '### ' + nm + '\\nPath: ' + fp + '\\n' + txt;\n" +
"          }).join('\\n\\n');\n" +
"        }\n" +
"      }\n" +
"    } catch (e) {\n" +
"      console.warn('[ATTACHMENTS_TASKSTORE_V10/readChatFiles] failed', e);\n" +
"    }\n" +
"    fileBlock += '\\n\\nUse these attached files as the source. Do NOT ask me again where the file is located.';\n" +
"    return header + '\\n' + text + fileBlock;\n" +
"  } catch (e) {\n" +
"    console.warn('[ATTACHMENTS_TASKSTORE_V10/augment] failed', e);\n" +
"    return text;\n" +
"  }\n" +
"};\n";

    const imports = s.match(/^(?:import[^\n]*\n)+/m);
    if (imports) s = imports[0] + helper + s.slice(imports[0].length);
    else s = helper + s;
  }

  if (s.includes("startTask: async (config: TaskConfig) => {") && !s.includes("ATTACHMENTS_TASKSTORE_V10_START")) {
    s = s.replace(
      "startTask: async (config: TaskConfig) => {",
      "startTask: async (config: TaskConfig) => {\n\n    // ATTACHMENTS_TASKSTORE_V10_START\n    config = { ...config, prompt: await __augmentPromptWithPickedFilesV10(config.prompt) };"
    );
  }

  if (s.includes("sendFollowUp: async (message: string) => {") && !s.includes("ATTACHMENTS_TASKSTORE_V10_FOLLOWUP")) {
    s = s.replace(
      "sendFollowUp: async (message: string) => {",
      "sendFollowUp: async (message: string) => {\n    // ATTACHMENTS_TASKSTORE_V10_FOLLOWUP\n    message = await __augmentPromptWithPickedFilesV10(message);"
    );
  }

  write(p, s);
  console.log("✅ patched taskStore:", p);
}

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

function patchPermissionDialog() {
  const p = path.join(ROOT, "apps", "web", "src", "client", "components", "execution", "PermissionDialog.tsx");
  if (!exists(p)) { console.warn("PermissionDialog not found:", p); return; }
  let s = read(p);
  s = ensureUseEffectImport(s);

  if (!s.includes("AUTO_DIALOGS_WITH_FILES_V10")) {
    const block =
"\n  // AUTO_DIALOGS_WITH_FILES_V10\n" +
"  useEffect(() => {\n" +
"    (async () => {\n" +
"      try {\n" +
"        const w = window as any;\n" +
"        const candidates = [\n" +
"          w?.accomplish?.getLastPickedChatFiles,\n" +
"          w?.rodjerhelpExtras?.getLastPickedChatFiles,\n" +
"          w?.getLastPickedChatFiles,\n" +
"        ] as any[];\n" +
"        let paths: string[] = [];\n" +
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
"        const buttons = Array.from(document.querySelectorAll('button')) as HTMLButtonElement[];\n" +
"        const submitBtn = buttons.find((b) => /submit/i.test(b.textContent || '') || /отправ/i.test(b.textContent || '')) || null;\n" +
"\n" +
"        if (/(данные|источник)/i.test(title)) {\n" +
"          const option = Array.from(document.querySelectorAll('button, [role=\"button\"], [data-radix-collection-item]')).find((el) => /(excel|csv|файл)/i.test((el.textContent || '').trim())) as HTMLElement | undefined;\n" +
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
"          const option = Array.from(document.querySelectorAll('button, [role=\"button\"], [data-radix-collection-item]')).find((el) => want.test((el.textContent || '').trim())) as HTMLElement | undefined;\n" +
"          if (option) option.click();\n" +
"          if (submitBtn) submitBtn.click();\n" +
"          return;\n" +
"        }\n" +
"\n" +
"        if (/уточнение/i.test(title)) {\n" +
"          const option = Array.from(document.querySelectorAll('button, [role=\"button\"], [data-radix-collection-item]')).find((el) => /(бренд|модель)/i.test((el.textContent || '').trim())) as HTMLElement | undefined;\n" +
"          if (option) option.click();\n" +
"          if (submitBtn) submitBtn.click();\n" +
"          return;\n" +
"        }\n" +
"      } catch (e) {\n" +
"        console.warn('[AUTO_DIALOGS_WITH_FILES_V10] failed', e);\n" +
"      }\n" +
"    })();\n" +
"  }, []);\n";

    const idx = s.indexOf("const [");
    if (idx !== -1) {
      const after = s.indexOf("\n", idx);
      s = s.slice(0, after + 1) + block + s.slice(after + 1);
    } else {
      const f = s.indexOf("{", s.indexOf("function"));
      s = (f !== -1) ? (s.slice(0, f + 1) + block + s.slice(f + 1)) : (block + s);
    }
  }

  // Safe leftover RU replacements in this UI file
  s = s.split("or type your own").join("или введите свой вариант");
  s = s.split("Loading agent...").join("Загрузка агента...");
  s = s.split(">read<").join(">читать<");

  write(p, s);
  console.log("✅ patched PermissionDialog:", p);
}

function patchExactRussianLeftovers() {
  const roots = [
    path.join(ROOT, "apps", "web", "src"),
    path.join(ROOT, "apps", "web", "locales"),
  ].filter(exists);

  for (const root of roots) {
    for (const f of walk(root)) {
      if (!/\.(ts|tsx|json|md|css)$/.test(f)) continue;
      let s = read(f);
      const orig = s;
      s = s.split("Loading agent...").join("Загрузка агента...");
      s = s.split("or type your own").join("или введите свой вариант");
      s = s.split(">read<").join(">читать<");
      if (s !== orig) write(f, s);
    }
  }
  console.log("✅ patched exact RU leftovers");
}

patchPreload();
patchTaskStore();
patchPermissionDialog();
patchExactRussianLeftovers();
console.log("✅ v10 root-cause fix applied. Now run: pnpm -F @accomplish/desktop build:base");
