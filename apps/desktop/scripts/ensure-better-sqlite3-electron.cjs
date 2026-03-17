const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function getElectronVersion(desktopRoot) {
  const packageJson = require(path.join(desktopRoot, 'package.json'));
  const rawVersion = packageJson.devDependencies?.electron ?? '35.0.0';
  return rawVersion.replace(/^[^\d]*/, '');
}

function getBetterSqlitePath(desktopRoot) {
  return path.join(desktopRoot, 'node_modules', 'better-sqlite3');
}

function getElectronBinaryPath(desktopRoot) {
  return path.join(
    desktopRoot,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'electron.cmd' : 'electron',
  );
}

function validateBetterSqliteWithElectron(desktopRoot, env = process.env) {
  const electronBinary = getElectronBinaryPath(desktopRoot);
  const validationScript = path.join(desktopRoot, 'scripts', 'validate-native-modules.cjs');
  const result = spawnSync(
    electronBinary,
    [validationScript],
    {
      cwd: desktopRoot,
      env,
      encoding: 'utf8',
      shell: process.platform === 'win32',
    },
  );

  return {
    ok: result.status === 0,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

function ensureLocalPackageCopy(pkgPath) {
  if (!fs.existsSync(pkgPath)) {
    throw new Error(`better-sqlite3 not found at ${pkgPath}`);
  }

  const stats = fs.lstatSync(pkgPath);
  if (!stats.isSymbolicLink()) {
    return false;
  }

  const realPath = fs.realpathSync(pkgPath);
  const tempPath = path.join(path.dirname(pkgPath), `.better-sqlite3-local-${Date.now()}`);
  fs.rmSync(tempPath, { recursive: true, force: true });
  fs.cpSync(realPath, tempPath, { recursive: true });
  fs.rmSync(pkgPath, { recursive: true, force: true });
  fs.renameSync(tempPath, pkgPath);
  return true;
}

function installElectronPrebuild(desktopRoot, pkgPath) {
  const electronVersion = getElectronVersion(desktopRoot);
  const buildPath = path.join(pkgPath, 'build');
  fs.rmSync(buildPath, { recursive: true, force: true });

  const prebuildBinary = path.join(
    pkgPath,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'prebuild-install.cmd' : 'prebuild-install',
  );
  const result = spawnSync(
    prebuildBinary,
    ['--runtime', 'electron', '--target', electronVersion],
    {
      cwd: pkgPath,
      env: process.env,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    },
  );

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`prebuild-install failed with exit code ${result.status}`);
  }
}

function ensurePackageDependencies(pkgPath) {
  const bindingsPath = path.join(pkgPath, 'node_modules', 'bindings');
  const prebuildInstallPath = path.join(pkgPath, 'node_modules', 'prebuild-install');

  if (fs.existsSync(bindingsPath) && fs.existsSync(prebuildInstallPath)) {
    return;
  }

  const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const result = spawnSync(npmCommand, ['install', '--omit=dev', '--no-package-lock'], {
    cwd: pkgPath,
    env: process.env,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`npm install failed with exit code ${result.status}`);
  }
}

function ensureBetterSqliteElectronBuild(options = {}) {
  const desktopRoot = options.desktopRoot ?? path.join(__dirname, '..');
  const env = options.env ?? process.env;
  const pkgPath = getBetterSqlitePath(desktopRoot);

  const initialValidation = validateBetterSqliteWithElectron(desktopRoot, env);
  if (initialValidation.ok) {
    return { changed: false };
  }

  const copiedLocally = ensureLocalPackageCopy(pkgPath);
  ensurePackageDependencies(pkgPath);
  installElectronPrebuild(desktopRoot, pkgPath);

  const finalValidation = validateBetterSqliteWithElectron(desktopRoot, env);
  if (!finalValidation.ok) {
    const details = (finalValidation.stderr || finalValidation.stdout || 'Unknown validation error')
      .trim();
    throw new Error(`Electron validation failed after rebuild: ${details}`);
  }

  return { changed: true, copiedLocally };
}

module.exports = {
  ensureBetterSqliteElectronBuild,
};

if (require.main === module) {
  try {
    const result = ensureBetterSqliteElectronBuild();
    if (result.changed) {
      console.log('better-sqlite3 Electron build ensured');
    } else {
      console.log('better-sqlite3 Electron build already valid');
    }
  } catch (error) {
    console.error(error instanceof Error ? error.stack || error.message : String(error));
    process.exit(1);
  }
}
