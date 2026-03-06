/**
 * Auto-fill/submit "Файл" question using last picked attachment path.
 *
 * Usage:
 *   cd C:\Yandex.Disk\Project\RodjerHelp
 *   node scripts\apply_auto_file_question_patch.js
 */
const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}
function read(p){ return fs.readFileSync(p,"utf8"); }
function write(p,s){ fs.writeFileSync(p,s,"utf8"); }

function patchHandlers() {
  const p = path.join(ROOT, "apps", "desktop", "src", "main", "ipc", "handlers.ts");
  if (!fs.existsSync(p)) throw new Error("handlers.ts not found: " + p);
  let s = read(p);

  if (!s.includes("LAST_PICKED_CHAT_FILES_V1")) {
    const marker = "const API_KEY_VALIDATION_TIMEOUT_MS";
    const idx = s.indexOf(marker);
    const insert = `\n// LAST_PICKED_CHAT_FILES_V1\nlet __lastPickedChatFiles: string[] = [];\n`;
    if (idx !== -1) s = s.slice(0, idx) + insert + s.slice(idx);
    else s = insert + s;
  }

  if (s.includes("handle('chat:pick-files'") && !s.includes("__lastPickedChatFiles = result.canceled")) {
    s = s.replace(
      /handle\('chat:pick-files'[\s\S]*?const result = await dialog\.showOpenDialog\([\s\S]*?\);\s*\n/,
      (m) => m + "  __lastPickedChatFiles = result.canceled ? [] : result.filePaths;\n"
    );
  }

  if (!s.includes("chat:last-picked-files")) {
    const add = `\n// Expose last picked chat files for auto-filling File question dialog\nhandle('chat:last-picked-files', async () => {\n  return __lastPickedChatFiles || [];\n});\n`;
    const pos = s.indexOf("handle('chat:pick-files'");
    if (pos !== -1) {
      const end = s.indexOf("});", pos);
      if (end !== -1) s = s.slice(0, end + 3) + add + s.slice(end + 3);
      else s += add;
    } else {
      s += add;
    }
  }

  write(p, s);
  console.log("✅ patched handlers.ts");
}

function patchPreload() {
  const p = path.join(ROOT, "apps", "desktop", "src", "preload", "index.ts");
  if (!fs.existsSync(p)) throw new Error("preload index.ts not found: " + p);
  let s = read(p);
  if (s.includes("getLastPickedChatFiles")) return console.log("✅ preload already patched");

  const idx = s.indexOf("pickChatFiles");
  if (idx !== -1) {
    const lineEnd = s.indexOf("\n", idx);
    const insert = "\n    getLastPickedChatFiles: () => ipcRenderer.invoke('chat:last-picked-files'),";
    s = s.slice(0, lineEnd) + insert + s.slice(lineEnd);
  } else {
    s += "\n// getLastPickedChatFiles\n// eslint-disable-next-line @typescript-eslint/no-explicit-any\n(window as any).getLastPickedChatFiles = () => ipcRenderer.invoke('chat:last-picked-files');\n";
  }
  write(p, s);
  console.log("✅ patched preload index.ts");
}

function patchRendererApi() {
  const p = path.join(ROOT, "apps", "web", "src", "client", "lib", "rodjerhelp.ts");
  if (!fs.existsSync(p)) throw new Error("rodjerhelp.ts not found: " + p);
  let s = read(p);
  if (s.includes("getLastPickedChatFiles")) return console.log("✅ rodjerhelp.ts already patched");

  const m = s.match(/export\s+const\s+\w+\s*=\s*\{/);
  if (m) {
    const start = m.index + m[0].length;
    s = s.slice(0, start) + "\n  getLastPickedChatFiles: (): Promise<string[]> => window.accomplish.getLastPickedChatFiles(),\n" + s.slice(start);
  } else {
    s += "\nexport const getLastPickedChatFiles = (): Promise<string[]> => window.accomplish.getLastPickedChatFiles();\n";
  }
  write(p, s);
  console.log("✅ patched rodjerhelp.ts");
}

function patchQuestionModal() {
  const srcDir = path.join(ROOT, "apps", "web", "src");
  if (!fs.existsSync(srcDir)) throw new Error("apps/web/src not found");

  const files = walk(srcDir).filter(p => p.endsWith(".tsx") || p.endsWith(".ts"));
  const target = files.find(p => {
    const t = read(p);
    return t.includes("Enter a different option") || t.includes("or type your own");
  });

  if (!target) {
    console.warn("⚠️ Could not locate Question modal component by text. Search manually for 'Enter a different option'.");
    return;
  }

  let s = read(target);
  if (s.includes("AUTO_FILE_QUESTION_V1")) {
    console.log("✅ question modal already patched:", target);
    return;
  }

  // Ensure useEffect is imported (best-effort)
  s = s.replace(/import\s+\{\s*([^}]*)\s*\}\s*from\s*['"]react['"];/, (m, inner) => {
    if (inner.includes("useEffect")) return m;
    return `import { ${inner.trim()}, useEffect } from 'react';`;
  });
  s = s.replace(/import\s+React,\s*\{\s*([^}]*)\s*\}\s*from\s*['"]react['"];/, (m, inner) => {
    if (inner.includes("useEffect")) return m;
    return `import React, { ${inner.trim()}, useEffect } from 'react';`;
  });

  const insert = `\n  // AUTO_FILE_QUESTION_V1: auto-fill "Файл" question with last picked attachment path\n  useEffect(() => {\n    try {\n      // @ts-ignore\n      const title = (request?.title || request?.label || '').toString();\n      if (!title || !/файл/i.test(title)) return;\n      // @ts-ignore\n      const api = (window as any).accomplish;\n      if (!api?.getLastPickedChatFiles) return;\n      (async () => {\n        const paths = await api.getLastPickedChatFiles();\n        const p = Array.isArray(paths) && paths.length ? paths[0] : '';\n        if (!p) return;\n        // @ts-ignore\n        if (typeof onSubmit === 'function') {\n          try { onSubmit({ customText: p, selectedOptions: [] }); return; } catch {}\n          try { onSubmit(p); return; } catch {}\n        }\n        // @ts-ignore\n        if (typeof handleSubmit === 'function') {\n          try { handleSubmit({ customText: p, selectedOptions: [] }); return; } catch {}\n          try { handleSubmit(p); return; } catch {}\n        }\n      })();\n    } catch (e) {\n      console.warn('[AUTO_FILE_QUESTION_V1] failed', e);\n    }\n  }, [request]);\n`;

  const hookPos = s.indexOf("const [");
  if (hookPos !== -1) {
    const afterLine = s.indexOf("\n", hookPos);
    s = s.slice(0, afterLine + 1) + insert + s.slice(afterLine + 1);
  } else {
    const funcIdx = s.indexOf("function");
    const bodyPos = funcIdx !== -1 ? s.indexOf("{", funcIdx) : -1;
    if (bodyPos !== -1) s = s.slice(0, bodyPos + 1) + insert + s.slice(bodyPos + 1);
    else s = insert + s;
  }

  write(target, s);
  console.log("✅ patched question modal:", target);
}

function main() {
  patchHandlers();
  patchPreload();
  patchRendererApi();
  patchQuestionModal();
  console.log("✅ Auto-file-question patch applied.");
}

main();
