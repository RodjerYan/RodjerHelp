/**
 * v6 Fix (robust):
 * Patch central store apps/web/src/client/stores/taskStore.ts
 *
 * In startTask(config):
 * - If window.rodjerhelpExtras.getLastPickedChatFiles() returns paths,
 *   prepend "📎 Вложения: ..." to config.prompt so the user sees it in the chat bubble.
 * - Append an "[Attached file paths]" block so the agent does not ask for the path again.
 *
 * Usage:
 *   cd C:\Yandex.Disk\Project\RodjerHelp
 *   node scripts\\fix-attachments-taskstore-v6.js
 *   pnpm -F @accomplish/desktop build:unpack
 */
const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
const storePath = path.join(ROOT, "apps", "web", "src", "client", "stores", "taskStore.ts");

if (!fs.existsSync(storePath)) {
  console.error("taskStore.ts not found:", storePath);
  process.exit(1);
}

let src = fs.readFileSync(storePath, "utf8");

if (src.includes("ATTACHMENTS_TASKSTORE_V6")) {
  console.log("✅ taskStore.ts already patched (v6).");
  process.exit(0);
}

const marker = "startTask: async (config: TaskConfig) => {";
const idx = src.indexOf(marker);
if (idx === -1) {
  console.error("Could not find startTask handler in taskStore.ts");
  process.exit(2);
}

const insertPoint = idx + marker.length;

const block = `

    // ATTACHMENTS_TASKSTORE_V6
    try {
      const extras = (window as any)?.rodjerhelpExtras;
      const getter = extras?.getLastPickedChatFiles;
      const paths = (typeof getter === 'function') ? await getter() : [];
      const clean = Array.isArray(paths) ? paths.filter(Boolean).map(String) : [];
      if (clean.length && typeof config?.prompt === 'string' && !config.prompt.includes('📎 Вложения:')) {
        const names = clean.map((p) => (p.split(/[\\\\/]/).pop() || p)).slice(0, 10);
        const more = clean.length > 10 ? (' +' + String(clean.length - 10)) : '';
        const header = '📎 Вложения: ' + names.join(', ') + more;

        const pathBlock =
          '\\n\\n[Attached file paths]\\n' +
          clean.map((p) => '- ' + p).join('\\n') +
          '\\n\\nUse these paths directly. Do NOT ask me to provide the path again.';

        config = { ...config, prompt: header + '\\n' + config.prompt + pathBlock };
      }
    } catch (e) {
      console.warn('[ATTACHMENTS_TASKSTORE_V6] failed', e);
    }
`;

src = src.slice(0, insertPoint) + block + src.slice(insertPoint);

fs.writeFileSync(storePath, src, "utf8");
console.log("✅ Patched taskStore.ts (v6):", storePath);
console.log("Now rebuild: pnpm -F @accomplish/desktop build:unpack");
