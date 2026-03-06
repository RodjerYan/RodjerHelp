const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
const filePath = path.join(ROOT, "apps", "desktop", "src", "preload", "index.ts");

if (!fs.existsSync(filePath)) {
  console.error("preload index.ts not found:", filePath);
  process.exit(1);
}

let src = fs.readFileSync(filePath, "utf8");
const original = src;

// remove BOM
src = src.replace(/^\uFEFF/, "");

// remove broken stray fragment near top
src = src.replace(/^\s*ctron main process via IPC\.\r?\n\s*\*\/\r?\n/m, "");
src = src.replace(/\r?\n\s*ctron main process via IPC\.\r?\n\s*\*\/\r?\n/m, "\n");

// find import block
const m = src.match(/^(?:import[^\n]*\n)+/);
const header =
  "/**\n" +
  " * Exposes a limited API to the renderer process.\n" +
  " * All privileged operations are routed to the Electron main process via IPC.\n" +
  " */\n";

if (m) {
  const imports = m[0];
  let rest = src.slice(imports.length);

  // drop immediately following broken/duplicate docblock if it mentions the same header
  rest = rest.replace(/^\s*\/\*\*[\s\S]*?\*\/\s*/, function(block) {
    if (
      block.indexOf("renderer process") >= 0 ||
      block.indexOf("main process via IPC") >= 0 ||
      block.indexOf("ctron main process") >= 0
    ) {
      return "";
    }
    return block;
  });

  src = imports + "\n" + header + rest.replace(/^\s+/, "");
} else {
  if (src.indexOf("Exposes a limited API to the renderer process") === -1) {
    src = header + src;
  }
}

if (src !== original) {
  fs.writeFileSync(filePath, src, "utf8");
  console.log("OK: fixed preload header:", filePath);
} else {
  console.log("OK: no changes needed");
}
