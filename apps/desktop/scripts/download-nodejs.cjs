/**
 * Download Node.js standalone binaries for bundling with the Electron app.
 *
 * Default behavior:
 * - On Windows: download ONLY win32-x64 (avoids tar extracting macOS symlinks on NTFS)
 * - On macOS: download ONLY darwin-x64 + darwin-arm64
 *
 * To force downloading all bundles (CI / cross-build), set:
 *   NODEJS_DOWNLOAD_ALL=1
 *
 * Usage: node scripts/download-nodejs.cjs
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const NODE_VERSION = '20.18.1';
const BASE_URL = `https://nodejs.org/dist/v${NODE_VERSION}`;

const ALL_PLATFORMS = [
  {
    name: 'darwin-x64',
    file: `node-v${NODE_VERSION}-darwin-x64.tar.gz`,
    extract: 'tar',
    sha256: 'c5497dd17c8875b53712edaf99052f961013cedc203964583fc0cfc0aaf93581',
  },
  {
    name: 'darwin-arm64',
    file: `node-v${NODE_VERSION}-darwin-arm64.tar.gz`,
    extract: 'tar',
    sha256: '9e92ce1032455a9cc419fe71e908b27ae477799371b45a0844eedb02279922a4',
  },
  {
    name: 'win32-x64',
    file: `node-v${NODE_VERSION}-win-x64.zip`,
    extract: 'zip',
    sha256: '56e5aacdeee7168871721b75819ccacf2367de8761b78eaceacdecd41e04ca03',
  },
];

const RESOURCES_DIR = path.join(__dirname, '..', 'resources', 'nodejs');

function pickPlatforms() {
  if (process.env.NODEJS_DOWNLOAD_ALL === '1') return ALL_PLATFORMS;

  // IMPORTANT: extracting the macOS tarballs on Windows fails because they contain symlinks.
  if (process.platform === 'win32') {
    return ALL_PLATFORMS.filter((p) => p.name === 'win32-x64');
  }

  if (process.platform === 'darwin') {
    return ALL_PLATFORMS.filter((p) => p.name.startsWith('darwin-'));
  }

  // We currently bundle Node only for win/mac targets used by this project.
  // Keep this explicit so CI surprises are obvious.
  return [];
}

/**
 * Download a file from URL with progress reporting
 */
function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    console.log(`Downloading: ${url}`);

    const file = fs.createWriteStream(destPath);

    https
      .get(url, (response) => {
        // Handle redirects
        if (response.statusCode === 302 || response.statusCode === 301) {
          file.close();
          fs.rmSync(destPath, { force: true });
          return downloadFile(response.headers.location, destPath).then(resolve).catch(reject);
        }

        if (response.statusCode !== 200) {
          file.close();
          fs.rmSync(destPath, { force: true });
          reject(new Error(`Failed to download: HTTP ${response.statusCode}`));
          return;
        }

        const totalSize = parseInt(response.headers['content-length'] || '0', 10);
        let downloadedSize = 0;
        let lastPercent = 0;

        response.on('data', (chunk) => {
          downloadedSize += chunk.length;
          if (!totalSize) return;
          const percent = Math.floor((downloadedSize / totalSize) * 100);
          if (percent >= lastPercent + 10) {
            process.stdout.write(`  ${percent}%`);
            lastPercent = percent;
          }
        });

        response.pipe(file);

        file.on('finish', () => {
          file.close();
          console.log(' Done');
          resolve();
        });
      })
      .on('error', (err) => {
        file.close();
        fs.rmSync(destPath, { force: true });
        reject(err);
      });
  });
}

/**
 * Verify SHA256 checksum of a file
 */
function verifyChecksum(filePath, expectedHash) {
  console.log('  Verifying checksum...');
  const fileBuffer = fs.readFileSync(filePath);
  const hashSum = crypto.createHash('sha256');
  hashSum.update(fileBuffer);
  const actualHash = hashSum.digest('hex');

  if (actualHash !== expectedHash) {
    throw new Error(`Checksum mismatch!\n  Expected: ${expectedHash}\n  Got: ${actualHash}`);
  }
  console.log('  Checksum verified');
}

/**
 * Extract archive to destination
 */
function extractArchive(archivePath, destDir, type) {
  console.log(`  Extracting to ${destDir}...`);

  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }

  if (type === 'tar') {
    execFileSync('tar', ['-xzf', archivePath, '-C', destDir], { stdio: 'inherit' });
  } else if (type === 'zip') {
    if (process.platform === 'win32') {
      execFileSync(
        'powershell',
        ['-NoProfile', '-Command', `Expand-Archive -Path "${archivePath}" -DestinationPath "${destDir}" -Force`],
        { stdio: 'inherit' },
      );
    } else {
      execFileSync('unzip', ['-o', archivePath, '-d', destDir], { stdio: 'inherit' });
    }
  }

  console.log('  Extraction complete');
}

async function main() {
  console.log(`\nNode.js v${NODE_VERSION} Binary Downloader`);
  console.log('='.repeat(50));

  const PLATFORMS = pickPlatforms();
  if (PLATFORMS.length === 0) {
    console.log(`\nNothing to download for platform: ${process.platform} (${process.arch})`);
    return;
  }

  if (!fs.existsSync(RESOURCES_DIR)) {
    fs.mkdirSync(RESOURCES_DIR, { recursive: true });
  }

  const tempDir = path.join(RESOURCES_DIR, '.temp');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  for (const platform of PLATFORMS) {
    console.log(`\nProcessing ${platform.name}...`);

    const archivePath = path.join(tempDir, platform.file);
    const destDir = path.join(RESOURCES_DIR, platform.name);

    const extractedDir = path.join(destDir, platform.file.replace(/\.(tar\.gz|zip)$/, ''));
    if (fs.existsSync(extractedDir)) {
      console.log(`  Already exists: ${extractedDir}`);
      continue;
    }

    if (!fs.existsSync(archivePath)) {
      const url = `${BASE_URL}/${platform.file}`;
      await downloadFile(url, archivePath);
    } else {
      console.log(`  Using cached: ${archivePath}`);
    }

    verifyChecksum(archivePath, platform.sha256);
    extractArchive(archivePath, destDir, platform.extract);
  }

  console.log('\nCleaning up temp files...');
  fs.rmSync(tempDir, { recursive: true, force: true });

  console.log('\nAll Node.js binaries downloaded successfully!');
  console.log(`Location: ${RESOURCES_DIR}`);

  console.log('\nDirectory structure:');
  for (const platform of PLATFORMS) {
    const destDir = path.join(RESOURCES_DIR, platform.name);
    if (fs.existsSync(destDir)) {
      const contents = fs.readdirSync(destDir);
      console.log(`  ${platform.name}/`);
      contents.forEach((item) => console.log(`    ${item}/`));
    }
  }
}

main().catch((err) => {
  console.error('\nError:', err.message);
  process.exit(1);
});
