/**
 * v11: repair taskStore.ts after v10 helper was inserted inside a multi-line import block.
 *
 * What it does:
 * 1) removes any previously inserted ATTACHMENTS_TASKSTORE_V10 helper block
 * 2) reinserts it strictly AFTER:
 *      import { getRodjerHelp } from '../lib/rodjerhelp';
 * 3) ensures startTask/sendFollowUp wrappers exist once
 *
 * Usage:
 *   cd C:\Yandex.Disk\Project\RodjerHelp
 *   node scripts\fix-taskstore-v10-placement-v11.js
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

// remove any broken helper block from previous runs
src = src.replace(
  /\n\/\/ ATTACHMENTS_TASKSTORE_V10[\s\S]*?const __augmentPromptWithPickedFilesV10 = async \(text: string\): Promise<string> => \{[\s\S]*?\n\};\n?/m,
  "\n"
);

// remove duplicated start/followup injected lines if present
src = src.replace(/\n\s*\/\/ ATTACHMENTS_TASKSTORE_V10_START[^\n]*\n\s*config = \{ \.\.\.config, prompt: await __augmentPromptWithPickedFilesV10\(config\.prompt\) \};/m, "");
src = src.replace(/\n\s*\/\/ ATTACHMENTS_TASKSTORE_V10_FOLLOWUP[^\n]*\n\s*message = await __augmentPromptWithPickedFilesV10\(message\);/m, "");

// anchor after getRodjerHelp import
const anchor = "import { getRodjerHelp } from '../lib/rodjerhelp';";
const idx = src.indexOf(anchor);
if (idx === -1) {
  console.error("Anchor import not found in taskStore.ts:", anchor);
  process.exit(2);
}
const insertAt = idx + anchor.length;

const helper = `

// ATTACHMENTS_TASKSTORE_V10
const __getPickedFilesV10 = async (): Promise<string[]> => {
  try {
    const w = window as any;
    const candidates = [
      w?.accomplish?.getLastPickedChatFiles,
      w?.rodjerhelpExtras?.getLastPickedChatFiles,
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
    console.warn('[ATTACHMENTS_TASKSTORE_V10/getter] failed', e);
  }
  return [];
};

const __augmentPromptWithPickedFilesV10 = async (text: string): Promise<string> => {
  try {
    if (typeof text !== 'string') return text as any;
    if (text.includes('📎 Вложения:')) return text;

    const paths = await __getPickedFilesV10();
    if (!paths.length) return text;

    const names = paths.map((p) => (String(p).split(/[\\\\/]/).pop() || String(p))).slice(0, 10);
    const more = paths.length > 10 ? (' +' + String(paths.length - 10)) : '';
    const header = '📎 Вложения: ' + names.join(', ') + more;

    let fileBlock =
      '\\n\\n[Attached file paths]\\n' +
      paths.map((p) => '- ' + p).join('\\n') +
      '\\n';

    try {
      const api = getRodjerHelp() as any;
      if (api && typeof api.readChatFiles === 'function') {
        const files = await api.readChatFiles(paths);
        if (Array.isArray(files) && files.length) {
          fileBlock +=
            '\\n[Attached file contents]\\n' +
            files.map((f: any) => {
              const fp = f?.path || '';
              const nm = f?.name || (String(fp).split(/[\\\\/]/).pop() || 'file');
              const txt = typeof f?.text === 'string' ? f.text : '';
              return '### ' + nm + '\\nPath: ' + fp + '\\n' + txt;
            }).join('\\n\\n');
        }
      }
    } catch (e) {
      console.warn('[ATTACHMENTS_TASKSTORE_V10/readChatFiles] failed', e);
    }

    fileBlock += '\\n\\nUse these attached files as the source. Do NOT ask me again where the file is located.';
    return header + '\\n' + text + fileBlock;
  } catch (e) {
    console.warn('[ATTACHMENTS_TASKSTORE_V10/augment] failed', e);
    return text;
  }
};
`;

src = src.slice(0, insertAt) + helper + src.slice(insertAt);

// inject wrappers exactly once
if (src.includes("startTask: async (config: TaskConfig) => {") && !src.includes("ATTACHMENTS_TASKSTORE_V10_START")) {
  src = src.replace(
    "startTask: async (config: TaskConfig) => {",
    "startTask: async (config: TaskConfig) => {\n\n    // ATTACHMENTS_TASKSTORE_V10_START\n    config = { ...config, prompt: await __augmentPromptWithPickedFilesV10(config.prompt) };"
  );
}

if (src.includes("sendFollowUp: async (message: string) => {") && !src.includes("ATTACHMENTS_TASKSTORE_V10_FOLLOWUP")) {
  src = src.replace(
    "sendFollowUp: async (message: string) => {",
    "sendFollowUp: async (message: string) => {\n    // ATTACHMENTS_TASKSTORE_V10_FOLLOWUP\n    message = await __augmentPromptWithPickedFilesV10(message);"
  );
}

fs.writeFileSync(filePath, src, "utf8");
console.log("✅ Repaired taskStore.ts helper placement:", filePath);
