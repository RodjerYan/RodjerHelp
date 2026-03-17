/**
 * Custom postinstall script that handles Windows-specific node-pty build issues.
 *
 * On Windows, we skip electron-rebuild because:
 * 1. node-pty has prebuilt binaries that work with Electron's ABI
 * 2. Building from source has issues with batch file path handling and Spectre mitigation
 * 3. The pnpm patch creates paths that exceed Windows' 260 character limit
 *
 * On macOS/Linux, we run electron-rebuild normally.
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const { ensureBetterSqliteElectronBuild } = require('./ensure-better-sqlite3-electron.cjs');

// Prevent infinite recursion when npm install triggers parent postinstall
// This happens on Windows where npm walks up to find package.json
if (process.env.ACCOMPLISH_POSTINSTALL_RUNNING) {
  console.log('> Postinstall already running, skipping nested invocation');
  process.exit(0);
}
process.env.ACCOMPLISH_POSTINSTALL_RUNNING = '1';

const isWindows = process.platform === 'win32';

function runCommand(command, description) {
  console.log(`\n> ${description}...`);
  try {
    execSync(command, {
      stdio: 'inherit',
      cwd: path.join(__dirname, '..'),
      shell: true,
      env: {
        ...process.env,
        ACCOMPLISH_POSTINSTALL_RUNNING: '1',
      },
    });
  } catch (error) {
    console.error(`Failed: ${description}`);
    process.exit(1);
  }
}

if (isWindows) {
  console.log('\n> Windows: ensuring Electron-compatible better-sqlite3 build...');
  try {
    ensureBetterSqliteElectronBuild({ desktopRoot: path.join(__dirname, '..') });
    console.log('> better-sqlite3 Electron build is ready');
  } catch (error) {
    console.error('> Failed to ensure better-sqlite3 Electron build:', error.message);
    console.error('> The app may not work correctly until the native module is rebuilt.');
  }

  // Verify node-pty prebuilds exist
  const pnpmNodePty = findNodePty();
  if (pnpmNodePty) {
    const prebuildsPath = path.join(pnpmNodePty, 'prebuilds', 'win32-x64');
    if (fs.existsSync(prebuildsPath)) {
      console.log('> node-pty prebuilds found, setup complete');
    } else {
      console.error('> Error: node-pty prebuilds not found at', prebuildsPath);
      console.error('> The app will not work correctly without prebuilds on Windows.');
      process.exit(1);
    }
  }
} else {
  // On macOS/Linux, run electron-rebuild first (matches original behavior)
  runCommand('npx electron-rebuild', 'Running electron-rebuild');
}

const useBundledMcp = process.env.ACCOMPLISH_BUNDLED_MCP === '1' || process.env.CI === 'true';

// Install shared MCP tools runtime dependencies (Playwright) at mcp-tools/ root
// MCP tools are now in packages/agent-core/mcp-tools
const mcpToolsPath = path.join(__dirname, '..', '..', '..', 'packages', 'agent-core', 'mcp-tools');
runCommand(
  `npm --prefix "${mcpToolsPath}" install --omit=dev --no-package-lock`,
  'Installing shared MCP tools runtime dependencies',
);

// Install per-tool dependencies for dev/tsx workflows
if (!useBundledMcp) {
  // Install ALL dependencies (including devDependencies) during development
  // because esbuild needs them for bundling. The bundle-skills.cjs script
  // will reinstall with --omit=dev during packaged builds.
  const tools = [
    'dev-browser',
    'dev-browser-mcp',
    'file-permission',
    'ask-user-question',
    'complete-task',
    'start-task',
  ];
  for (const tool of tools) {
    runCommand(
      `npm --prefix "${mcpToolsPath}/${tool}" install --no-package-lock`,
      `Installing ${tool} dependencies`,
    );
  }
}

console.log('\n> Postinstall complete!');

function findNodePty() {
  return findPackage('node-pty');
}

function findPackage(packageName) {
  // Try to find package in node_modules (may be a symlink in pnpm)
  const directPath = path.join(__dirname, '..', 'node_modules', packageName);
  if (fs.existsSync(directPath)) {
    // Resolve symlink to get actual path
    const realPath = fs.realpathSync(directPath);
    return realPath;
  }

  // Look in pnpm's .pnpm directory
  const pnpmPath = path.join(__dirname, '..', '..', '..', 'node_modules', '.pnpm');
  if (fs.existsSync(pnpmPath)) {
    const entries = fs.readdirSync(pnpmPath);
    for (const entry of entries) {
      if (entry.startsWith(`${packageName}@`)) {
        const packageDir = path.join(pnpmPath, entry, 'node_modules', packageName);
        if (fs.existsSync(packageDir)) {
          return packageDir;
        }
      }
    }
  }

  return null;
}
