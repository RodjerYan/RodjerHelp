/**
 * v2: robust sidebar square-corners patch
 *
 * Why v1 failed:
 * - it checked only a few hard-coded CSS paths
 *
 * What v2 does:
 * - recursively scans apps/web/src for *.css
 * - prefers a file containing "macos26-sidebar"
 * - otherwise patches the largest/global CSS file
 * - appends a safe CSS override to remove left sidebar rounding
 *
 * Usage:
 *   cd C:\Yandex.Disk\Project\RodjerHelp
 *   node scripts\fix-sidebar-square-corners-v2.js
 *
 * Optional rebuild:
 *   pnpm -F @accomplish/web build
 *   or
 *   pnpm -F @accomplish/desktop build:base
 */
const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
const webSrc = path.join(ROOT, "apps", "web", "src");

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

if (!fs.existsSync(webSrc)) {
  console.error("apps/web/src not found:", webSrc);
  process.exit(1);
}

const cssFiles = walk(webSrc).filter((p) => p.toLowerCase().endsWith(".css"));
if (!cssFiles.length) {
  console.error("No CSS files found under:", webSrc);
  process.exit(2);
}

let target =
  cssFiles.find((p) => {
    try {
      const s = fs.readFileSync(p, "utf8");
      return s.includes("macos26-sidebar");
    } catch {
      return false;
    }
  }) ||
  cssFiles
    .map((p) => ({ p, size: fs.statSync(p).size }))
    .sort((a, b) => b.size - a.size)[0].p;

let css = fs.readFileSync(target, "utf8");

if (!css.includes("SIDEBAR_SQUARE_CORNERS_V2")) {
  css += `

/* SIDEBAR_SQUARE_CORNERS_V2
   Remove rounding from the left sidebar/panel only. */
.macos26-sidebar,
.dark .macos26-sidebar,
aside.macos26-sidebar,
[data-slot="sidebar"].macos26-sidebar,
[data-slot="sidebar"],
.sidebar,
.app-sidebar {
  border-radius: 0 !important;
  overflow: hidden;
}

.macos26-sidebar::before,
.macos26-sidebar::after,
[data-slot="sidebar"]::before,
[data-slot="sidebar"]::after,
.sidebar::before,
.sidebar::after,
.app-sidebar::before,
.app-sidebar::after {
  border-radius: 0 !important;
}

.macos26-sidebar > div,
[data-slot="sidebar"] > div,
.sidebar > div,
.app-sidebar > div {
  border-radius: 0 !important;
}
`;
  fs.writeFileSync(target, css, "utf8");
  console.log("✅ Sidebar square-corners CSS appended to:", target);
} else {
  console.log("✅ Sidebar square-corners patch already present in:", target);
}
