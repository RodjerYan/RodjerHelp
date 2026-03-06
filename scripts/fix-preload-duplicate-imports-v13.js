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

// Remove BOM
src = src.replace(/^\uFEFF/, "");

// Deduplicate exact duplicate import lines while preserving first occurrence order.
const seen = new Set();
const lines = src.split(/\r?\n/);
const out = [];

for (const line of lines) {
  const trimmed = line.trim();

  // Only dedupe exact import lines. Leave everything else untouched.
  if (trimmed.startsWith("import ")) {
    if (seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
  }

  out.push(line);
}

src = out.join("\n");

// Clean excessive blank lines at top caused by removals
src = src.replace(/^(\s*\n){3,}/, "\n\n");

if (src !== original) {
  fs.writeFileSync(filePath, src, "utf8");
  console.log("OK: removed duplicate imports in", filePath);
} else {
  console.log("OK: no duplicate imports found");
}
