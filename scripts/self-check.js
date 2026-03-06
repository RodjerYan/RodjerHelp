const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = process.cwd();
const files = [
  'apps/web/src/client/components/chat/AttachmentChatInput.tsx',
  'apps/web/src/client/components/chat/AttachmentPreview.tsx',
  'apps/web/src/client/api/chatApi.ts',
  'apps/web/src/client/types/chat.ts',
  'server-example/src/routes/messages.ts',
];

let hasError = false;

for (const rel of files) {
  const file = path.join(root, rel);
  const src = fs.readFileSync(file, 'utf8');
  const result = ts.transpileModule(src, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.ESNext,
      jsx: ts.JsxEmit.ReactJSX,
    },
    reportDiagnostics: true,
    fileName: rel,
  });

  const diagnostics = result.diagnostics || [];
  if (diagnostics.length) {
    hasError = true;
    console.log('\nFAIL:', rel);
    for (const d of diagnostics) {
      console.log(ts.flattenDiagnosticMessageText(d.messageText, '\n'));
    }
  } else {
    console.log('OK:', rel);
  }
}

process.exit(hasError ? 1 : 0);
