/**
 * Fix: Agent keeps asking for file path even when a file is attached.
 *
 * Approach:
 * - Ensure the "prepend attachments to prompt" block includes BOTH:
 *   - absolute file path(s)
 *   - file contents (truncated)
 *   - explicit instruction: "use the paths below, do not ask again"
 *
 * This patch ONLY edits Home.tsx inside the ATTACHMENTS_CONTEXT_V1 block (or inserts V2 if missing).
 *
 * Usage:
 *   cd C:\Yandex.Disk\Project\RodjerHelp
 *   node scripts\fix-attachments-no-path.js
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

if (src.includes("ATTACHMENTS_CONTEXT_V2")) {
  console.log("✅ Home.tsx already has ATTACHMENTS_CONTEXT_V2");
  process.exit(0);
}

// Replace existing V1 block if present
const reV1 = /\/\/\s*ATTACHMENTS_CONTEXT_V1:[\s\S]*?text\s*=\s*[\s\S]*?\+\s*text;\s*\n\s*}\s*\n/m;

const replacement = `
    // ATTACHMENTS_CONTEXT_V2: prepend attached files path + content to the prompt (so agent won't ask for a path again)
    if (attachedFiles?.length) {
      const fileResults = await rodjerhelp.readChatFiles(attachedFiles.map((f) => f.path));
      const blocks: string[] = [];
      for (const f of fileResults) {
        const p = f.path || '';
        const name = f.name || p.split(/[\\\\/]/).pop() || 'file';
        if (f.error) {
          blocks.push(\`- \${name} (path: \${p}): ERROR \${f.error}\`);
          continue;
        }
        const head = \`### File: \${name}\\nPath: \${p}\\nSize: \${f.size ?? 0} bytes\${f.truncated ? ' [TRUNCATED]' : ''}\`;
        blocks.push(head + \`\\n\\n\\\`\\\`\\\`\\n\${f.text ?? ''}\\n\\\`\\\`\\\`\\n\`);
      }

      // IMPORTANT: tell the agent it already has the path+content and must not ask again.
      text =
        \`[Attached files]\\n\\n\` +
        \`You already have the absolute file path(s) and the contents below. Use them directly and DO NOT ask me to provide the path again.\\n\\n\` +
        blocks.join('\\n\\n') +
        '\\n\\n' +
        text;
    }
`;

if (reV1.test(src)) {
  src = src.replace(reV1, replacement);
  src = src.replace("ATTACHMENTS_CONTEXT_V1", "ATTACHMENTS_CONTEXT_V2");
  fs.writeFileSync(homePath, src, "utf8");
  console.log("✅ Updated attachments prompt block to V2:", homePath);
  process.exit(0);
}

// If no V1 block, try to insert after first async send handler
const reArrow = /const\s+\w+\s*=\s*async\s*\(\s*text\s*:\s*string\s*\)\s*=>\s*\{/m;
const m = src.match(reArrow);
if (!m) {
  console.warn("⚠️ Could not find send handler to patch. Please locate the function that sends the prompt and add the V2 block manually.");
  process.exit(2);
}
const idx = m.index + m[0].length;
src = src.slice(0, idx) + "\n" + replacement + src.slice(idx);
fs.writeFileSync(homePath, src, "utf8");
console.log("✅ Inserted ATTACHMENTS_CONTEXT_V2 block into send handler:", homePath);
