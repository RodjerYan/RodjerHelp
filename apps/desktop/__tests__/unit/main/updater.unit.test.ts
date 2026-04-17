import { EventEmitter } from 'events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type IpcHandler = (event: unknown, ...args: unknown[]) => unknown;

class MockAutoUpdater extends EventEmitter {
  autoDownload = false;
  autoInstallOnAppQuit = false;
  checkForUpdates = vi.fn(async () => undefined);
  downloadUpdate = vi.fn(async () => undefined);
  quitAndInstall = vi.fn();
}

const mockApp = new EventEmitter() as EventEmitter & { isPackaged: boolean };
const mockAutoUpdater = new MockAutoUpdater();
const mockExistsSync = vi.fn(() => true);
const mockShowMessageBox = vi.fn(async () => ({ response: 0 }));
const ipcHandlers = new Map<string, IpcHandler>();

const mockIpcMain = {
  handle: vi.fn((channel: string, handler: IpcHandler) => {
    ipcHandlers.set(channel, handler);
  }),
};

vi.mock('electron', () => ({
  app: mockApp,
  dialog: {
    showMessageBox: mockShowMessageBox,
  },
  ipcMain: mockIpcMain,
}));

vi.mock('electron-updater', () => ({
  autoUpdater: mockAutoUpdater,
}));

vi.mock('fs', () => ({
  default: {
    existsSync: mockExistsSync,
  },
  existsSync: mockExistsSync,
}));

describe('updater', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetModules();
    vi.clearAllMocks();

    ipcHandlers.clear();
    mockApp.removeAllListeners();
    mockAutoUpdater.removeAllListeners();

    mockApp.isPackaged = true;
    mockExistsSync.mockReturnValue(true);
    mockAutoUpdater.autoDownload = false;
    mockAutoUpdater.autoInstallOnAppQuit = false;
    mockAutoUpdater.checkForUpdates.mockResolvedValue(undefined);

    Object.defineProperty(process, 'resourcesPath', {
      value: 'C:\\mock\\resources',
      configurable: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('checks for updates at startup and periodically while app is running', async () => {
    const { initializeAutoUpdater } = await import('@main/updater');

    initializeAutoUpdater(() => null);
    mockApp.emit('browser-window-created');

    expect(mockAutoUpdater.autoDownload).toBe(true);
    expect(mockAutoUpdater.autoInstallOnAppQuit).toBe(true);
    expect(mockAutoUpdater.checkForUpdates).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(15000);
    expect(mockAutoUpdater.checkForUpdates).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(4 * 60 * 60 * 1000);
    expect(mockAutoUpdater.checkForUpdates).toHaveBeenCalledTimes(2);

    mockApp.emit('before-quit');
    await vi.advanceTimersByTimeAsync(4 * 60 * 60 * 1000);
    expect(mockAutoUpdater.checkForUpdates).toHaveBeenCalledTimes(2);
  });

  it('runs update check from in-app IPC action', async () => {
    const { registerUpdaterIpc } = await import('@main/updater');

    registerUpdaterIpc(() => null);
    const checkHandler = ipcHandlers.get('update:check');

    expect(checkHandler).toBeDefined();
    await checkHandler?.({} as never);

    expect(mockAutoUpdater.checkForUpdates).toHaveBeenCalledTimes(1);
  });

  it('installs update automatically when download completes', async () => {
    const { initializeAutoUpdater } = await import('@main/updater');

    initializeAutoUpdater(() => null);
    mockAutoUpdater.emit('update-downloaded', { version: '0.3.99' });

    await vi.runAllTimersAsync();
    expect(mockAutoUpdater.quitAndInstall).toHaveBeenCalledTimes(1);
  });
});
