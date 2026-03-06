/**
 * Fix TypeScript build errors from AUTO_FILE_QUESTION_V1 patch.
 *
 * Usage:
 *   cd C:\Yandex.Disk\Project\RodjerHelp
 *   node scripts\fix-auto-file-question-build.js
 */
const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
const permPath = path.join(ROOT, "apps", "web", "src", "client", "components", "execution", "PermissionDialog.tsx");
const apiPath  = path.join(ROOT, "apps", "web", "src", "client", "lib", "rodjerhelp.ts");

function read(p){ return fs.readFileSync(p,"utf8"); }
function write(p,s){ fs.writeFileSync(p,s,"utf8"); }

function fixPermissionDialog() {
  if (!fs.existsSync(permPath)) { console.warn("PermissionDialog.tsx not found:", permPath); return; }
  let s = read(permPath);

  // Remove AUTO_FILE_QUESTION_V1 block by lines
  if (s.includes("AUTO_FILE_QUESTION_V1")) {
    const lines = s.split(/\r?\n/);
    const out = [];
    let skip = false;
    for (let i=0;i<lines.length;i++){
      const line = lines[i];
      if (!skip && line.includes("AUTO_FILE_QUESTION_V1")) { skip = true; continue; }
      if (skip) {
        if (line.trim().endsWith("]);")) { skip = false; continue; }
        continue;
      }
      out.push(line);
    }
    s = out.join("\n");
  }

  // Ensure useEffect import (best effort)
  if (!s.includes("useEffect")) {
    s = s.replace(/import\s+\{\s*([^}]*)\s*\}\s*from\s*['"]react['"];/, (m, inner) => {
      if (inner.includes("useEffect")) return m;
      return `import { ${inner.trim()}, useEffect } from 'react';`;
    });
    s = s.replace(/import\s+React,\s*\{\s*([^}]*)\s*\}\s*from\s*['"]react['"];/, (m, inner) => {
      if (inner.includes("useEffect")) return m;
      return `import React, { ${inner.trim()}, useEffect } from 'react';`;
    });
  }

  // Insert AUTO_FILE_QUESTION_V2 once
  if (!s.includes("AUTO_FILE_QUESTION_V2")) {
    const block = `
  // AUTO_FILE_QUESTION_V2: auto-fill "Файл" dialog with last picked attachment path (DOM-based)
  useEffect(() => {
    (async () => {
      try {
        const titleText = (document.querySelector('h1,h2,h3,[role="heading"]')?.textContent || '').trim();
        if (!/файл/i.test(titleText)) return;

        // @ts-ignore
        const api = (window as any)?.accomplish;
        const getter = api?.getLastPickedChatFiles;
        if (typeof getter !== 'function') return;

        const paths = await getter();
        const p = Array.isArray(paths) && paths.length ? String(paths[0]) : '';
        if (!p) return;

        const input =
          (document.querySelector('input[placeholder*="Enter"]') ||
            document.querySelector('input[placeholder*="option"]') ||
            document.querySelector('input[type="text"]')) as HTMLInputElement | null;

        if (input) {
          input.focus();
          input.value = p;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }

        const buttons = Array.from(document.querySelectorAll('button')) as HTMLButtonElement[];
        const submitBtn =
          buttons.find((b) => /submit/i.test(b.textContent || '')) ||
          buttons.find((b) => /отправ/i.test(b.textContent || '')) ||
          null;

        submitBtn?.click();
      } catch (e) {
        console.warn('[AUTO_FILE_QUESTION_V2] failed', e);
      }
    })();
  }, []);
`;
    const idx = s.indexOf("const [");
    if (idx !== -1) {
      const after = s.indexOf("\n", idx);
      s = s.slice(0, after + 1) + block + s.slice(after + 1);
    } else {
      const f = s.indexOf("{", s.indexOf("function"));
      s = (f !== -1) ? (s.slice(0, f + 1) + block + s.slice(f + 1)) : (block + s);
    }
  }

  write(permPath, s);
  console.log("✅ PermissionDialog.tsx fixed");
}

function fixRodjerhelp() {
  if (!fs.existsSync(apiPath)) { console.warn("rodjerhelp.ts not found:", apiPath); return; }
  let s = read(apiPath);

  const iface = s.match(/export\s+interface\s+RodjerHelpAPI\s*\{[\s\S]*?\n\}/m);
  if (iface && !iface[0].includes("getLastPickedChatFiles")) {
    const injected = iface[0].replace(/\n\}/, "\n  getLastPickedChatFiles?: () => Promise<string[]>;\n}\n");
    s = s.replace(iface[0], injected);
  }

  s = s.replace(
    /export\s+const\s+getLastPickedChatFiles\s*=\s*\(\)\s*:\s*Promise<string\[\]>\s*=>\s*window\.accomplish\.getLastPickedChatFiles\(\);\s*/m,
    "export const getLastPickedChatFiles = async (): Promise<string[]> => {\n  const api = window.accomplish;\n  if (!api?.getLastPickedChatFiles) return [];\n  return api.getLastPickedChatFiles();\n};\n"
  );

  if (!s.includes("export const getLastPickedChatFiles")) {
    s += "\nexport const getLastPickedChatFiles = async (): Promise<string[]> => {\n  const api = window.accomplish;\n  if (!api?.getLastPickedChatFiles) return [];\n  return api.getLastPickedChatFiles();\n};\n";
  }

  write(apiPath, s);
  console.log("✅ rodjerhelp.ts fixed");
}

fixPermissionDialog();
fixRodjerhelp();
console.log("✅ Done. Rebuild now: pnpm -F @accomplish/desktop build:unpack");
