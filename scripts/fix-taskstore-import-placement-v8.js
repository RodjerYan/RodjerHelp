/**
 * Fix broken helper insertion in apps/web/src/client/stores/taskStore.ts
 *
 * Problem:
 * - helper consts were inserted in the middle of the import block
 * - TS then sees `const ...` before `} from ...` is closed
 *
 * What this script does:
 * 1) removes previously inserted ATTACHMENTS_TASKSTORE_V7 helper block if present
 * 2) reinserts it AFTER the full import block
 * 3) keeps startTask/sendFollowUp patches
 *
 * Usage:
 *   cd C:\Yandex.Disk\Project\RodjerHelp
 *   node scripts\fix-taskstore-import-placement-v8.js
 *   pnpm -F @accomplish/desktop build:base
 */
const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
const filePath = path.join(ROOT, "apps", "web", "src", "client", "stores", "taskStore.ts");

if (!fs.existsSync(filePath)) {
  console.error("taskStore.ts not found:", filePath);
  process.exit(1);
}

let src = fs.readFileSync(filePath, "utf8");

// Remove existing helper block if present
src = src.replace(
  /\n\/\/ ATTACHMENTS_TASKSTORE_V7[\s\S]*?const __augmentPromptWithPickedFilesV7 = async \(text: string\): Promise<string> => \{[\s\S]*?\n\};\n?/m,
  "\n"
);

// Insert helper AFTER last import semicolon
const importMatches = [...src.matchAll(/^import[\s\S]*?;\s*$/gm)];
if (!importMatches.length) {
  console.error("Could not find import block in taskStore.ts");
  process.exit(2);
}
const lastImport = importMatches[importMatches.length - 1];
const insertAt = lastImport.index + lastImport[0].length;

const helper = `

// ATTACHMENTS_TASKSTORE_V7
const __getPickedFilesV7 = async (): Promise<string[]> => {
  try {
    const w = window as any;
    const candidates = [
      w?.rodjerhelpExtras?.getLastPickedChatFiles,
      w?.accomplish?.getLastPickedChatFiles,
      w?.getLastPickedChatFiles,
    ];
    for (const getter of candidates) {
      if (typeof getter === 'function') {
        const val = await getter();
        const arr = Array.isArray(val) ? val.filter(Boolean).map(String) : [];
        if (arr.length) return arr;
      }
    }
  } catch (e) {
    console.warn('[ATTACHMENTS_TASKSTORE_V7/getter] failed', e);
  }
  return [];
};

const __augmentPromptWithPickedFilesV7 = async (text: string): Promise<string> => {
  try {
    if (typeof text !== 'string') return text as any;
    const paths = await __getPickedFilesV7();
    if (!paths.length) return text;
    if (text.includes('📎 Вложения:')) return text;

    const names = paths.map((p) => (String(p).split(/[\\\\/]/).pop() || String(p))).slice(0, 10);
    const more = paths.length > 10 ? (' +' + String(paths.length - 10)) : '';
    const header = '📎 Вложения: ' + names.join(', ') + more;
    const pathBlock =
      '\\n\\n[Attached file paths]\\n' +
      paths.map((p) => '- ' + p).join('\\n') +
      '\\n\\nUse these paths directly. Do NOT ask me to provide the path again.';

    return header + '\\n' + text + pathBlock;
  } catch (e) {
    console.warn('[ATTACHMENTS_TASKSTORE_V7/augment] failed', e);
    return text;
  }
};
`;

src = src.slice(0, insertAt) + helper + src.slice(insertAt);

// Ensure startTask patch exists exactly once
if (src.includes("startTask: async (config: TaskConfig) => {") && !src.includes("ATTACHMENTS_TASKSTORE_V7_START")) {
  src = src.replace(
    "startTask: async (config: TaskConfig) => {",
    "startTask: async (config: TaskConfig) => {\n\n    // ATTACHMENTS_TASKSTORE_V7_START\n    config = { ...config, prompt: await __augmentPromptWithPickedFilesV7(config.prompt) };"
  );
}

// Ensure sendFollowUp patch exists exactly once
if (src.includes("sendFollowUp: async (message: string) => {") && !src.includes("ATTACHMENTS_TASKSTORE_V7_FOLLOWUP")) {
  src = src.replace(
    "sendFollowUp: async (message: string) => {",
    "sendFollowUp: async (message: string) => {\n    // ATTACHMENTS_TASKSTORE_V7_FOLLOWUP\n    message = await __augmentPromptWithPickedFilesV7(message);"
  );
}

fs.writeFileSync(filePath, src, "utf8");
console.log("✅ Fixed taskStore.ts helper placement:", filePath);
