/**
 * Fix: Agent still asks for file path even when attachments are selected.
 *
 * This version doesn't rely on finding a specific "send handler" name.
 * It patches Home.tsx by:
 *  1) Injecting an async helper buildPromptWithAttachments(text) before the first `return (`
 *  2) Rewriting the task start config prompt to:
 *       prompt: await buildPromptWithAttachments(<originalPromptVar>)
 *     within the vicinity of the 'task:start' call.
 *
 * Safe/Idempotent:
 *  - Will not re-insert if marker ATTACHMENTS_PROMPT_V2 already exists.
 *  - Only touches apps/web/src/client/pages/Home.tsx.
 *
 * Usage:
 *   cd C:\Yandex.Disk\Project\RodjerHelp
 *   node scripts\\fix-attachments-no-path-v2.js
 */
const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
const homePath = path.join(ROOT, "apps", "web", "src", "client", "pages", "Home.tsx");

if (!fs.existsSync(homePath)) {
  console.error("Home.tsx not found:", homePath);
  process.exit(1);
}

let src = fs.readFileSync(homePath, "utf8");

if (src.includes("ATTACHMENTS_PROMPT_V2")) {
  console.log("✅ Home.tsx already patched (ATTACHMENTS_PROMPT_V2)");
  process.exit(0);
}

// 1) Inject helper before the first `return (` (inside component scope)
const helper = `
  // ATTACHMENTS_PROMPT_V2: build prompt with attached files (path + content) to avoid asking for path again
  const buildPromptWithAttachments = async (text: string): Promise<string> => {
    try {
      // attachedFiles should be in component state (from the attach UI patch)
      // If none, return original.
      // @ts-ignore
      if (!attachedFiles || attachedFiles.length === 0) return text;

      // @ts-ignore
      const paths = attachedFiles.map((f: any) => f.path).filter(Boolean);
      // @ts-ignore
      const fileResults = await rodjerhelp.readChatFiles(paths);

      const blocks: string[] = [];
      for (const f of fileResults) {
        const p = f.path || '';
        const name = f.name || (p.split(/[\\\\/]/).pop() || 'file');
        if (f.error) {
          blocks.push(\`- \${name} (path: \${p}): ERROR \${f.error}\`);
          continue;
        }
        const head = \`### File: \${name}\\nPath: \${p}\\nSize: \${f.size ?? 0} bytes\${f.truncated ? ' [TRUNCATED]' : ''}\`;
        blocks.push(head + \`\\n\\n\\\`\\\`\\\`\\n\${f.text ?? ''}\\n\\\`\\\`\\\`\\n\`);
      }

      return (
        \`[Attached files]\\n\\n\` +
        \`You already have the absolute file path(s) and the contents below. Use them directly and DO NOT ask me to provide the path again.\\n\\n\` +
        blocks.join('\\n\\n') +
        '\\n\\n' +
        text
      );
    } catch (e) {
      console.warn('[Attachments] Failed to build prompt with attachments:', e);
      return text;
    }
  };
`;

// find first "return ("
const retIdx = src.indexOf("return (");
if (retIdx === -1) {
  console.error("Could not find `return (` in Home.tsx to inject helper safely.");
  process.exit(2);
}
src = src.slice(0, retIdx) + helper + "\\n" + src.slice(retIdx);

// 2) Rewrite the prompt field near task:start usage
const callIdx = src.indexOf("task:start");
let patched = false;

function patchPromptInRange(rangeStart, rangeEnd) {
  let chunk = src.slice(rangeStart, rangeEnd);
  chunk = chunk.replace(/prompt\\s*:\\s*(?!await\\s+buildPromptWithAttachments\\()([A-Za-z_$][\\w$]*)/g, (m, v) => {
    patched = true;
    return `prompt: await buildPromptWithAttachments(${v})`;
  });
  src = src.slice(0, rangeStart) + chunk + src.slice(rangeEnd);
}

if (callIdx !== -1) {
  const start = Math.max(0, callIdx - 2500);
  const end = Math.min(src.length, callIdx + 2500);
  patchPromptInRange(start, end);
}

if (!patched) {
  src = src.replace(/prompt\\s*:\\s*(?!await\\s+buildPromptWithAttachments\\()([A-Za-z_$][\\w$]*)/, (m, v) => {
    patched = true;
    return `prompt: await buildPromptWithAttachments(${v})`;
  });
}

if (!patched) {
  console.warn("⚠️ Could not patch any `prompt: <var>` field. Please patch manually.");
  process.exit(3);
}

fs.writeFileSync(homePath, src, "utf8");
console.log("✅ Patched Home.tsx: helper injected + prompt wrapped with buildPromptWithAttachments()");
