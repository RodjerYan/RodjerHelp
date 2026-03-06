/**
 * RodjerHelp patcher: Attachments -> agent flow + TS build fix.
 * Usage:
 *   cd C:\Yandex.Disk\Project\RodjerHelp
 *   node scripts\apply_attach_agentflow_patch.js
 */
const fs = require("fs");
const path = require("path");
const ROOT = process.cwd();

function read(p){return fs.readFileSync(p,"utf8");}
function write(p,s){fs.writeFileSync(p,s,"utf8");}
function exists(p){return fs.existsSync(p);}

function ensureImportHandlers(p){
  let s=read(p);
  if(!/import\s+\*\s+as\s+path\s+from\s+['"]path['"]/.test(s)){
    const m=s.match(/^(import[^\n]*\n)+/m);
    if(m) s=s.replace(m[0], m[0]+"import * as path from 'path';\n");
    else s="import * as path from 'path';\n"+s;
  }
  write(p,s);
}

function ensureIpcReadFiles(p){
  let s=read(p);
  if(s.includes("chat:read-files")) return;

  const insert = `
\n\n// --- Attachments: read selected files (with user confirmation) ---
ipcMain.handle('chat:read-files', async (_event, filePaths) => {
  try {
    const list = Array.isArray(filePaths) ? filePaths.filter(Boolean) : [];
    if (list.length === 0) return [];
    const { response } = await dialog.showMessageBox({
      type: 'question',
      buttons: ['Разрешить', 'Отмена'],
      defaultId: 0,
      cancelId: 1,
      title: 'Доступ к файлам',
      message: 'Разрешить приложению прочитать выбранные файлы и передать их в агент?',
      detail: list.map((p) => ` + "`" + `• ${p}` + "`" + `).join('\\n'),
    });
    if (response !== 0) return [];
    const MAX_BYTES = 256 * 1024;
    const results = [];
    for (const filePath of list) {
      try {
        const stat = await fs.promises.stat(filePath);
        const size = stat.size;
        const name = path.basename(filePath);
        const buf = await fs.promises.readFile(filePath);
        const sliced = buf.length > MAX_BYTES ? buf.subarray(0, MAX_BYTES) : buf;
        const text = sliced.toString('utf8');
        results.push({ path: filePath, name, size, truncated: buf.length > MAX_BYTES, text });
      } catch (e) {
        results.push({ path: filePath, name: path.basename(filePath), error: String(e) });
      }
    }
    return results;
  } catch (e) {
    console.error('[chat:read-files] failed', e);
    return [];
  }
});
// --- end attachments ---
`;

  const pickIdx=s.indexOf("chat:pick-files");
  if(pickIdx!==-1){
    const after=s.indexOf("});", pickIdx);
    if(after!==-1) s=s.slice(0,after+3)+insert+s.slice(after+3);
    else s+=insert;
  } else {
    s+=insert;
  }
  write(p,s);
}

function ensurePreload(p){
  let s=read(p);
  if(s.includes("readChatFiles")) return;
  const idx=s.indexOf("pickChatFiles");
  if(idx!==-1){
    const lineEnd=s.indexOf("\n", idx);
    const add="\n    readChatFiles: (filePaths: string[]) => ipcRenderer.invoke('chat:read-files', filePaths),";
    s=s.slice(0,lineEnd)+add+s.slice(lineEnd);
  } else {
    s += "\n// readChatFiles IPC\n(window as any).readChatFiles = (filePaths: string[]) => ipcRenderer.invoke('chat:read-files', filePaths);\n";
  }
  write(p,s);
}

function ensureRendererApi(p){
  let s=read(p);
  if(s.includes("readChatFiles")) return;

  if(!s.includes("export type ReadChatFileResult")){
    const t="\nexport type ReadChatFileResult = { path: string; name: string; size?: number; truncated?: boolean; text?: string; error?: string };\n";
    const ti=s.indexOf("export type PickedFile");
    if(ti!==-1){
      const after=s.indexOf("\n", ti);
      s=s.slice(0,after+1)+t+s.slice(after+1);
    } else {
      s=t+s;
    }
  }

  const m=s.match(/export\s+const\s+\w+\s*=\s*\{/);
  if(m){
    const start=m.index+m[0].length;
    const add="\n  readChatFiles: (filePaths: string[]): Promise<ReadChatFileResult[]> => window.accomplish.readChatFiles(filePaths),\n";
    s=s.slice(0,start)+add+s.slice(start);
  } else {
    s += "\nexport const readChatFiles = (filePaths: string[]): Promise<ReadChatFileResult[]> => window.accomplish.readChatFiles(filePaths);\n";
  }
  write(p,s);
}

function ensureHomeSendFlow(p){
  if(!exists(p)) return;
  let s=read(p);
  if(s.includes("ATTACHMENTS_CONTEXT_V1")) return;

  const re=/const\s+(\w+)\s*=\s*async\s*\(\s*text\s*:\s*string\s*\)\s*=>\s*\{/m;
  const m=s.match(re);
  if(!m) return;
  const idx=m.index+m[0].length;

  const inject = `
    // ATTACHMENTS_CONTEXT_V1: prepend attached files content to the prompt
    if (attachedFiles?.length) {
      const fileResults = await rodjerhelp.readChatFiles(attachedFiles.map((f) => f.path));
      const blocks: string[] = [];
      for (const f of fileResults) {
        if (f.error) { blocks.push(` + "`" + `- ${f.name}: ERROR ${f.error}` + "`" + `); continue; }
        const head = ` + "`" + `### File: ${f.name} (${f.size ?? 0} bytes)${f.truncated ? ' [TRUNCATED]' : ''}` + "`" + `;
        blocks.push(head + ` + "`" + `\n\n\`\`\`\n${f.text ?? ''}\n\`\`\`` + "`" + `);
      }
      text = ` + "`" + `[Attached files]\n\n${blocks.join('\n\n')}\n\n` + "`" + ` + text;
    }
`;
  s=s.slice(0,idx)+inject+s.slice(idx);
  write(p,s);
}

function main(){
  const handlers=path.join(ROOT,"apps","desktop","src","main","ipc","handlers.ts");
  const preload=path.join(ROOT,"apps","desktop","src","preload","index.ts");
  const api=path.join(ROOT,"apps","web","src","client","lib","rodjerhelp.ts");
  const home=path.join(ROOT,"apps","web","src","client","pages","Home.tsx");

  if(!exists(handlers)) { console.error("Cannot find", handlers); process.exit(1); }
  if(!exists(preload)) { console.error("Cannot find", preload); process.exit(1); }
  if(!exists(api)) { console.error("Cannot find", api); process.exit(1); }

  ensureImportHandlers(handlers);
  ensureIpcReadFiles(handlers);
  ensurePreload(preload);
  ensureRendererApi(api);
  ensureHomeSendFlow(home);

  console.log("✅ Patch applied.");
}
main();
