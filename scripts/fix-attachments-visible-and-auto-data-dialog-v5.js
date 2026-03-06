/**
 * v5 Fix:
 * - Make attachments visible in the user message (prefix "📎 Вложения: ...")
 * - Auto-answer "Данные"/"Источник" dialog by selecting Excel/CSV option when attachment exists
 *
 * Usage:
 *   cd C:\Yandex.Disk\Project\RodjerHelp
 *   node scripts\fix-attachments-visible-and-auto-data-dialog-v5.js
 *   pnpm -F @accomplish/desktop build:unpack
 */
const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
const WEB_SRC = path.join(ROOT, "apps", "web", "src");

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

function ensureUseEffectImport(tsx) {
  const re1 = /import\s+React,\s*\{\s*([^}]*)\s*\}\s*from\s*['"]react['"];/;
  const re2 = /import\s+\{\s*([^}]*)\s*\}\s*from\s*['"]react['"];/;
  if (re1.test(tsx)) {
    return tsx.replace(re1, (m, inner) =>
      inner.includes("useEffect") ? m :
      "import React, { " + inner.trim().replace(/\\s*,\\s*$/, "") + ", useEffect } from 'react';"
    );
  }
  if (re2.test(tsx)) {
    return tsx.replace(re2, (m, inner) =>
      inner.includes("useEffect") ? m :
      "import { " + inner.trim().replace(/\\s*,\\s*$/, "") + ", useEffect } from 'react';"
    );
  }
  if (!tsx.includes("useEffect")) return "import { useEffect } from 'react';\n" + tsx;
  return tsx;
}

function patchPermissionDialog() {
  const permPath = path.join(WEB_SRC, "client", "components", "execution", "PermissionDialog.tsx");
  if (!fs.existsSync(permPath)) return;

  let s = read(permPath);
  s = ensureUseEffectImport(s);

  const marker = "AUTO_SOURCE_FILE_DIALOG_V5";
  if (s.includes(marker)) return;

  const block = `
  // ${marker}: if attachment exists, auto-answer built-in dialogs (Данные/Источник and Файл).
  useEffect(() => {
    (async () => {
      try {
        const extras = (window as any)?.rodjerhelpExtras;
        const getter = extras?.getLastPickedChatFiles;
        if (typeof getter !== 'function') return;

        const paths = await getter();
        const firstPath = Array.isArray(paths) && paths.length ? String(paths[0]) : '';
        if (!firstPath) return;

        const title = (document.querySelector('h1,h2,h3,[role="heading"]')?.textContent || '').trim();

        if (/(данные|источник)/i.test(title)) {
          const optionEl =
            Array.from(document.querySelectorAll('button, [role="button"], [data-radix-collection-item]'))
              .find((el) => /(excel|csv|файл)/i.test((el.textContent || '').trim()));
          (optionEl as any)?.click();

          const buttons = Array.from(document.querySelectorAll('button')) as HTMLButtonElement[];
          const submitBtn =
            buttons.find((b) => /submit/i.test(b.textContent || '')) ||
            buttons.find((b) => /отправ/i.test(b.textContent || '')) ||
            null;
          submitBtn?.click();
          return;
        }

        if (/файл/i.test(title)) {
          const input =
            (document.querySelector('input[type="text"]') ||
             document.querySelector('input')) as HTMLInputElement | null;

          if (input) {
            input.focus();
            input.value = firstPath;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
          }

          const buttons = Array.from(document.querySelectorAll('button')) as HTMLButtonElement[];
          const submitBtn =
            buttons.find((b) => /submit/i.test(b.textContent || '')) ||
            buttons.find((b) => /отправ/i.test(b.textContent || '')) ||
            null;
          submitBtn?.click();
        }
      } catch (e) {
        console.warn('[${marker}] failed', e);
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

  write(permPath, s);
  console.log("✅ patched PermissionDialog:", permPath);
}

function patchSendHandler() {
  const files = walk(WEB_SRC).filter(p => p.endsWith(".ts") || p.endsWith(".tsx"));

  const candidates = files.filter(p => {
    const t = read(p);
    return t.includes("task:start") && t.includes("prompt:");
  });

  if (!candidates.length) {
    console.warn("⚠️ send handler not found (task:start + prompt:).");
    return;
  }

  const pick = (p) => (read(p).includes("invoke('task:start'") || read(p).includes('invoke("task:start"'));
  let target = candidates.find(pick) || candidates[0];

  let s = read(target);

  if (!s.includes("BUILD_PROMPT_WITH_ATTACHMENTS_V5")) {
    const insert = `
\n// BUILD_PROMPT_WITH_ATTACHMENTS_V5
const __buildPromptWithAttachmentsV5 = async (text: string, maybeFiles?: any[]): Promise<string> => {
  try {
    const files = Array.isArray(maybeFiles) ? maybeFiles : [];
    const pathsFromState = files.map((f: any) => f?.path).filter(Boolean);

    const extras = (window as any)?.rodjerhelpExtras;
    const last = (typeof extras?.getLastPickedChatFiles === 'function') ? await extras.getLastPickedChatFiles() : [];
    const paths = (pathsFromState.length ? pathsFromState : last).filter(Boolean);

    if (!paths.length) return text;

    const names = paths.map((p: string) => (p.split(/[\\\\/]/).pop() || p)).slice(0, 10);
    const header = '📎 Вложения: ' + names.join(', ') + (paths.length > 10 ? (' +' + String(paths.length - 10)) : '');

    const pathBlock = '\\n\\n[Attached file paths]\\n' + paths.map((p: string) => '- ' + p).join('\\n') +
      '\\n\\nUse these paths directly. Do NOT ask me to provide the path again.';

    return header + '\\n' + text + pathBlock;
  } catch (e) {
    console.warn('[BUILD_PROMPT_WITH_ATTACHMENTS_V5] failed', e);
    return text;
  }
};
`;
    // insert after imports
    const imports = s.match(/^(?:import[^\n]*\n)+/m);
    if (imports) {
      s = imports[0] + insert + s.slice(imports[0].length);
    } else {
      s = insert + s;
    }
  }

  // Wrap prompt inside task:start invoke
  const re = /invoke\(\s*['"]task:start['"]\s*,\s*\{([\s\S]*?)\}\s*\)/m;
  const m = s.match(re);
  if (m) {
    let body = m[1];
    if (!body.includes("__buildPromptWithAttachmentsV5")) {
      body = body.replace(/prompt\s*:\s*([^,\n}]+)/, (mm, expr) => {
        let arg2 = "undefined";
        if (s.includes("attachedFiles")) arg2 = "attachedFiles";
        else if (s.includes("attachments")) arg2 = "attachments";
        return "prompt: await __buildPromptWithAttachmentsV5(" + expr.trim() + ", " + arg2 + ")";
      });
      s = s.replace(re, "invoke('task:start', {" + body + "})");
    }
  }

  write(target, s);
  console.log("✅ patched send handler:", target);
}

patchPermissionDialog();
patchSendHandler();
console.log("✅ done. rebuild now.");
