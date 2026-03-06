/**
 * Fixes 2 issues:
 * 1) "Источник" dialog appears even when file is attached -> auto-select "Файл" and submit.
 * 2) Attachment not visible in sent message -> prepend visible attachments header to prompt.
 *
 * Usage:
 *   cd C:\Yandex.Disk\Project\RodjerHelp
 *   node scripts\fix-source-dialog-and-show-attachments.js
 *   pnpm -F @accomplish/desktop build:unpack
 */
const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
const permPath = path.join(ROOT, "apps", "web", "src", "client", "components", "execution", "PermissionDialog.tsx");
const homePath = path.join(ROOT, "apps", "web", "src", "client", "pages", "Home.tsx");

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
  if (!tsx.includes("useEffect")) {
    return "import { useEffect } from 'react';\n" + tsx;
  }
  return tsx;
}

function patchPermissionDialog() {
  if (!fs.existsSync(permPath)) throw new Error("PermissionDialog.tsx not found: " + permPath);
  let s = read(permPath);
  s = ensureUseEffectImport(s);

  if (!s.includes("AUTO_SOURCE_FILE_DIALOG_V1")) {
    const block = `
  // AUTO_SOURCE_FILE_DIALOG_V1: auto-answer Source/File dialogs when an attachment was picked.
  useEffect(() => {
    (async () => {
      try {
        // @ts-ignore
        const extras = (window as any)?.rodjerhelpExtras;
        const getter = extras?.getLastPickedChatFiles;
        if (typeof getter !== 'function') return;

        const paths = await getter();
        const firstPath = Array.isArray(paths) && paths.length ? String(paths[0]) : '';
        if (!firstPath) return;

        const title = (document.querySelector('h1,h2,h3,[role="heading"]')?.textContent || '').trim();

        // "Источник" -> click option containing "Файл" then Submit
        if (/источник/i.test(title)) {
          const optionEl =
            Array.from(document.querySelectorAll('button, [role="button"], [data-radix-collection-item]'))
              .find((el) => /файл/i.test((el.textContent || '').trim()));
          // @ts-ignore
          optionEl?.click();

          const buttons = Array.from(document.querySelectorAll('button')) as HTMLButtonElement[];
          const submitBtn =
            buttons.find((b) => /submit/i.test(b.textContent || '')) ||
            buttons.find((b) => /отправ/i.test(b.textContent || '')) ||
            null;
          submitBtn?.click();
          return;
        }

        // "Файл" -> fill input with path then Submit
        if (/файл/i.test(title)) {
          const input =
            (document.querySelector('input[placeholder*="Enter"]') ||
              document.querySelector('input[placeholder*="option"]') ||
              document.querySelector('input[type="text"]')) as HTMLInputElement | null;

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
        console.warn('[AUTO_SOURCE_FILE_DIALOG_V1] failed', e);
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
  console.log("✅ PermissionDialog patched:", permPath);
}

function patchHome() {
  if (!fs.existsSync(homePath)) throw new Error("Home.tsx not found: " + homePath);
  let s = read(homePath);

  if (!s.includes("ATTACHMENTS_PROMPT_V3")) {
    const retIdx = s.indexOf("return (");
    if (retIdx === -1) throw new Error("Can't find `return (` in Home.tsx");

    const helper = `
  // ATTACHMENTS_PROMPT_V3: show attachments in the user prompt and provide path+content to the agent.
  const buildPromptWithAttachments = async (text: string): Promise<string> => {
    try {
      // @ts-ignore
      const local = (typeof attachedFiles !== 'undefined' && Array.isArray(attachedFiles)) ? attachedFiles : [];
      // @ts-ignore
      const extras = (window as any)?.rodjerhelpExtras;
      const last = (typeof extras?.getLastPickedChatFiles === 'function') ? await extras.getLastPickedChatFiles() : [];
      const paths = (local.length ? local.map((f:any)=>f.path) : last).filter(Boolean);
      if (!paths.length) return text;

      const names = paths.map((p:string)=>p.split(/[\\\\/]/).pop() || p).slice(0, 6);
      const more = paths.length > 6 ? (' +' + String(paths.length - 6)) : '';
      const header = '📎 Вложения: ' + names.join(', ') + more;

      let blocks = '';
      try {
        // @ts-ignore
        const fileResults = await rodjerhelp.readChatFiles(paths);
        blocks =
          '\\n\\n[Attached files]\\n' +
          'You already have the absolute file path(s) and the contents below. Use them directly and DO NOT ask me to provide the path again.\\n\\n' +
          fileResults
            .map((f:any) => {
              const p = f.path || '';
              const nm = f.name || (p.split(/[\\\\/]/).pop() || 'file');
              if (f.error) return '- ' + nm + ' (path: ' + p + '): ERROR ' + f.error;
              const head = '### File: ' + nm + '\\nPath: ' + p + '\\nSize: ' + String(f.size ?? 0) + ' bytes' + (f.truncated ? ' [TRUNCATED]' : '');
              return head + '\\n\\n```\\n' + (f.text ?? '') + '\\n```';
            })
            .join('\\n\\n');
      } catch {}

      return header + '\\n' + text + blocks;
    } catch (e) {
      console.warn('[ATTACHMENTS_PROMPT_V3] failed:', e);
      return text;
    }
  };
`;
    s = s.slice(0, retIdx) + helper + "\n" + s.slice(retIdx);
  }

  const callIdx = s.indexOf("task:start");
  const wrap = (chunk) => chunk.replace(
    /prompt\s*:\s*(?!await\s+buildPromptWithAttachments\()([A-Za-z_$][\w$]*)/g,
    "prompt: await buildPromptWithAttachments($1)"
  );
  if (callIdx !== -1) {
    const start = Math.max(0, callIdx - 2500);
    const end = Math.min(s.length, callIdx + 2500);
    s = s.slice(0, start) + wrap(s.slice(start, end)) + s.slice(end);
  } else {
    s = s.replace(
      /prompt\s*:\s*(?!await\s+buildPromptWithAttachments\()([A-Za-z_$][\w$]*)/,
      "prompt: await buildPromptWithAttachments($1)"
    );
  }

  write(homePath, s);
  console.log("✅ Home.tsx patched:", homePath);
}

try {
  patchPermissionDialog();
  patchHome();
  console.log("✅ Done. Rebuild now: pnpm -F @accomplish/desktop build:unpack");
} catch (e) {
  console.error("Patch failed:", e);
  process.exit(1);
}
