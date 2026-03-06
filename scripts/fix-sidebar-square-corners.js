/**
 * Remove rounded corners from the left sidebar/panel.
 *
 * Usage:
 *   cd C:\Yandex.Disk\Project\RodjerHelp
 *   node scripts\fix-sidebar-square-corners.js
 *   pnpm -F @accomplish/desktop build:unpack
 */
const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
const candidates = [
  path.join(ROOT, "apps", "web", "src", "client", "index.css"),
  path.join(ROOT, "apps", "web", "src", "index.css"),
  path.join(ROOT, "apps", "web", "src", "styles.css"),
  path.join(ROOT, "apps", "web", "src", "app.css"),
];

const target = candidates.find((p) => fs.existsSync(p));
if (!target) {
  console.error("Could not find a target CSS file. Checked:\n" + candidates.join("\n"));
  process.exit(1);
}

let css = fs.readFileSync(target, "utf8");

if (!css.includes("SIDEBAR_SQUARE_CORNERS_V1")) {
  css += `

/* SIDEBAR_SQUARE_CORNERS_V1
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
  console.log("✅ CSS patch already present in:", target);
}
