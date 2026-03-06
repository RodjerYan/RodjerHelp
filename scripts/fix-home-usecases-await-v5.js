const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
const homePath = path.join(ROOT, "apps", "web", "src", "client", "pages", "Home.tsx");

if (!fs.existsSync(homePath)) {
  console.error("Home.tsx not found:", homePath);
  process.exit(1);
}

let src = fs.readFileSync(homePath, "utf8");

// 1) Replace the exact broken pattern(s) in USE_CASES.
// We target only the useCases.*.prompt template literals.
const re = /prompt\s*:\s*await\s+buildPromptWithAttachments\s*\(\s*t\s*\)\s*\(\s*`(useCases\.\$\{key\}\.prompt)`\s*\)\s*,/g;
src = src.replace(re, (_m, inner) => `prompt: t(\`${inner}\`),`);

// 2) Also handle if key is not ${key} (safety), but still useCases.*.prompt inside template literal.
const re2 = /prompt\s*:\s*await\s+buildPromptWithAttachments\s*\(\s*t\s*\)\s*\(\s*`(useCases\.[^`]*?\.prompt)`\s*\)\s*,/g;
src = src.replace(re2, (_m, inner) => `prompt: t(\`${inner}\`),`);

// 3) Remove any other accidental wrapping in USE_CASES: buildPromptWithAttachments(t)(`useCases...`)
const re3 = /prompt\s*:\s*(?:await\s+)?buildPromptWithAttachments\s*\(\s*t\s*\)\s*\(\s*`(useCases\.[^`]*?\.prompt)`\s*\)\s*,/g;
src = src.replace(re3, (_m, inner) => `prompt: t(\`${inner}\`),`);

fs.writeFileSync(homePath, src, "utf8");

// 4) Verify nothing like that remains
const needle = "buildPromptWithAttachments(t)(`useCases";
if (src.includes(needle) || src.includes("await buildPromptWithAttachments(t)(`useCases")) {
  console.error("❌ Still found bad wrapping in Home.tsx. Showing context:");
  const lines = src.split(/\r?\n/);
  lines.forEach((line, i) => {
    if (line.includes("buildPromptWithAttachments") && line.includes("useCases")) {
      console.error(`${i + 1}: ${line}`);
    }
  });
  process.exit(2);
}

console.log("✅ Fixed Home.tsx: removed await buildPromptWithAttachments(t)(`useCases...`) from USE_CASES prompts");