import { app, dialog, ipcMain, type BrowserWindow } from 'electron';
import { autoUpdater, type ProgressInfo, type UpdateInfo } from 'electron-updater';
import fs from 'fs';
import path from 'path';

type UpdateStatusState = {
  status:
    | 'idle'
    | 'checking'
    | 'available'
    | 'downloading'
    | 'downloaded'
    | 'not-available'
    | 'error';
  version?: string;
  progress?: number;
  transferred?: number;
  total?: number;
  message?: string;
};

let initialized = false;
let checking = false;
let currentStatus: UpdateStatusState = { status: 'idle' };
let mainWindowGetter: (() => BrowserWindow | null) | null = null;
let periodicCheckTimer: NodeJS.Timeout | null = null;

const STARTUP_CHECK_DELAY_MS = 15000;
const PERIODIC_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;

function getUpdateConfigPath(): string {
  return path.join(process.resourcesPath, 'app-update.yml');
}

function isUpdaterAvailable(): boolean {
  if (!app.isPackaged) {
    return false;
  }

  return fs.existsSync(getUpdateConfigPath());
}

function getMainWindow(): BrowserWindow | null {
  return mainWindowGetter?.() ?? null;
}

function emitStatus(status: UpdateStatusState): void {
  currentStatus = status;
  const win = getMainWindow();
  if (win && !win.isDestroyed()) {
    win.webContents.send('update:status', currentStatus);
  }
}

async function showMessage(
  win: BrowserWindow | null | undefined,
  options: Electron.MessageBoxOptions,
) {
  if (win && !win.isDestroyed()) {
    return dialog.showMessageBox(win, options);
  }
  return dialog.showMessageBox(options);
}

async function showInfo(title: string, message: string, detail?: string): Promise<void> {
  const win = getMainWindow();
  await showMessage(win, {
    type: 'info',
    title,
    message,
    detail,
    buttons: ['OK'],
  });
}

async function showError(title: string, message: string, detail?: string): Promise<void> {
  const win = getMainWindow();
  await showMessage(win, {
    type: 'error',
    title,
    message,
    detail,
    buttons: ['OK'],
  });
}

function schedulePeriodicChecks(): void {
  if (periodicCheckTimer) {
    return;
  }

  periodicCheckTimer = setInterval(() => {
    void triggerUpdateCheck(false);
  }, PERIODIC_CHECK_INTERVAL_MS);

  periodicCheckTimer.unref?.();
}

function installUpdate(): void {
  setImmediate(() => autoUpdater.quitAndInstall());
}

export async function triggerUpdateCheck(manual = false): Promise<UpdateStatusState> {
  if (!isUpdaterAvailable()) {
    const devStatus: UpdateStatusState = {
      status: 'not-available',
      message: app.isPackaged
        ? 'Автообновление недоступно для этой сборки приложения.'
        : 'Проверка обновлений доступна только в собранной версии приложения.',
    };
    emitStatus(devStatus);
    if (manual) {
      await showInfo('Обновления недоступны', devStatus.message ?? '');
    }
    return currentStatus;
  }

  if (checking) {
    return currentStatus;
  }

  checking = true;
  emitStatus({ status: 'checking' });

  try {
    await autoUpdater.checkForUpdates();
    return currentStatus;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    emitStatus({ status: 'error', message });
    if (manual) {
      await showError(
        'Не удалось проверить обновления',
        'Проверка обновлений завершилась ошибкой.',
        message,
      );
    }
    return currentStatus;
  } finally {
    checking = false;
  }
}

export function registerUpdaterIpc(getWindow: () => BrowserWindow | null): void {
  mainWindowGetter = getWindow;

  ipcMain.handle('update:get-status', () => currentStatus);
  ipcMain.handle('update:check', async () => triggerUpdateCheck(true));
  ipcMain.handle('update:install', async () => {
    if (currentStatus.status === 'downloaded') {
      setImmediate(() => autoUpdater.quitAndInstall());
      return true;
    }
    return false;
  });
}

export function initializeAutoUpdater(getWindow: () => BrowserWindow | null): void {
  if (initialized) {
    return;
  }
  initialized = true;
  mainWindowGetter = getWindow;

  if (!isUpdaterAvailable()) {
    return;
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => {
    emitStatus({ status: 'checking' });
  });

  autoUpdater.on('update-available', (info: UpdateInfo) => {
    emitStatus({ status: 'available', version: info.version });
    emitStatus({ status: 'downloading', version: info.version, progress: 0 });
  });

  autoUpdater.on('update-not-available', (info: UpdateInfo) => {
    emitStatus({
      status: 'not-available',
      version: info.version,
      message: 'У вас уже установлена последняя версия.',
    });
  });

  autoUpdater.on('download-progress', (progress: ProgressInfo) => {
    emitStatus({
      status: 'downloading',
      progress: progress.percent,
      transferred: progress.transferred,
      total: progress.total,
    });
  });

  autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
    emitStatus({
      status: 'downloaded',
      version: info.version,
      progress: 100,
      message: 'Обновление скачано. Выполняется автоматическая установка.',
    });
    installUpdate();
  });

  autoUpdater.on('error', (error: Error) => {
    emitStatus({ status: 'error', message: error.message });
  });

  app.once('browser-window-created', () => {
    if (!app.isPackaged) {
      return;
    }

    schedulePeriodicChecks();
    setTimeout(() => {
      void triggerUpdateCheck(false);
    }, STARTUP_CHECK_DELAY_MS);
  });

  app.on('before-quit', () => {
    if (periodicCheckTimer) {
      clearInterval(periodicCheckTimer);
      periodicCheckTimer = null;
    }
  });
}
