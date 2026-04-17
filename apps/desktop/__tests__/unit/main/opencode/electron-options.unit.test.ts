import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockStorage = {
  getActiveProviderModel: vi.fn(),
  getSelectedModel: vi.fn(),
  setSelectedModel: vi.fn(),
  getConnectedProvider: vi.fn(),
  updateProviderModel: vi.fn(),
  getOpenAiBaseUrl: vi.fn(() => ''),
};

const mockCoreBuildCliArgs = vi.fn((options: { selectedModel: { model: string } | null }) => [
  'run',
  '--model',
  options.selectedModel?.model ?? '',
]);

const mockGetOpenAiOauthStatus = vi.fn(() => ({ connected: false }));

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getPath: vi.fn(() => 'C:\\mock\\userData'),
    getAppPath: vi.fn(() => 'C:\\mock\\app'),
  },
}));

vi.mock('child_process', () => ({
  execSync: vi.fn(),
}));

vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn(() => true),
    accessSync: vi.fn(),
    writeFileSync: vi.fn(),
    unlinkSync: vi.fn(),
    constants: { X_OK: 0 },
  },
  existsSync: vi.fn(() => true),
  accessSync: vi.fn(),
  writeFileSync: vi.fn(),
  unlinkSync: vi.fn(),
  constants: { X_OK: 0 },
}));

vi.mock('@accomplish_ai/agent-core', () => ({
  DEV_BROWSER_PORT: 9224,
  getAzureEntraToken: vi.fn(),
  ensureDevBrowserServer: vi.fn(),
  resolveCliPath: vi.fn(),
  isCliAvailable: vi.fn(),
  buildCliArgs: mockCoreBuildCliArgs,
  buildOpenCodeEnvironment: vi.fn((env: NodeJS.ProcessEnv) => env),
  getOpenAiOauthStatus: mockGetOpenAiOauthStatus,
  getModelDisplayName: vi.fn(),
}));

vi.mock('@main/store/storage', () => ({
  getStorage: () => mockStorage,
}));

vi.mock('@main/store/secureStorage', () => ({
  getAllApiKeys: vi.fn(),
  getBedrockCredentials: vi.fn(),
  getApiKey: vi.fn((provider: string) => (provider === 'openai' ? 'sk-test' : null)),
}));

vi.mock('@main/opencode/config-generator', () => ({
  generateOpenCodeConfig: vi.fn(),
  getMcpToolsPath: vi.fn(() => 'C:\\mock\\mcp'),
  syncApiKeysToOpenCodeAuth: vi.fn(),
}));

vi.mock('@main/utils/system-path', () => ({
  getExtendedNodePath: vi.fn((value: string) => value),
}));

vi.mock('@main/utils/bundled-node', () => ({
  getBundledNodePaths: vi.fn(() => ({
    nodePath: 'C:\\mock\\node.exe',
    binDir: 'C:\\mock',
  })),
  logBundledNodeInfo: vi.fn(),
}));

describe('electron-options buildCliArgs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStorage.getActiveProviderModel.mockReturnValue(null);
    mockStorage.getSelectedModel.mockReturnValue(null);
    mockStorage.getConnectedProvider.mockReturnValue(null);
    mockGetOpenAiOauthStatus.mockReturnValue({ connected: false });
  });

  it('keeps OpenAI codex model when OAuth is not connected', async () => {
    mockStorage.getSelectedModel.mockReturnValue({
      provider: 'openai',
      model: 'openai/gpt-5.2-codex',
    });

    const { buildCliArgs } = await import('@main/opencode/electron-options');
    await buildCliArgs({ prompt: 'hello' } as never, 'task-1');

    expect(mockCoreBuildCliArgs).toHaveBeenCalledWith(
      expect.objectContaining({
        selectedModel: {
          provider: 'openai',
          model: 'openai/gpt-5.2-codex',
        },
      }),
    );
  });

  it('falls back from OpenAI codex model when OAuth is connected', async () => {
    mockStorage.getSelectedModel.mockReturnValue({
      provider: 'openai',
      model: 'openai/gpt-5.2-codex',
    });
    mockGetOpenAiOauthStatus.mockReturnValue({ connected: true });
    mockStorage.getConnectedProvider.mockReturnValue({
      connectionStatus: 'connected',
      selectedModelId: 'openai/gpt-5.2-codex',
      credentials: { type: 'oauth', oauthProvider: 'chatgpt' },
    });

    const { buildCliArgs } = await import('@main/opencode/electron-options');
    await buildCliArgs({ prompt: 'hello' } as never, 'task-1');

    expect(mockCoreBuildCliArgs).toHaveBeenCalledWith(
      expect.objectContaining({
        selectedModel: {
          provider: 'openai',
          model: 'openai/gpt-5.2',
        },
      }),
    );
    expect(mockStorage.setSelectedModel).toHaveBeenCalledWith({
      provider: 'openai',
      model: 'openai/gpt-5.2',
    });
    expect(mockStorage.updateProviderModel).toHaveBeenCalledWith('openai', 'openai/gpt-5.2');
  });

  it('falls back from OpenAI codex model when provider is connected via OAuth even if API key exists', async () => {
    mockStorage.getSelectedModel.mockReturnValue({
      provider: 'openai',
      model: 'openai/gpt-5.2-codex',
    });
    mockGetOpenAiOauthStatus.mockReturnValue({ connected: true });
    mockStorage.getConnectedProvider.mockReturnValue({
      connectionStatus: 'connected',
      selectedModelId: 'openai/gpt-5.2-codex',
      credentials: { type: 'oauth', oauthProvider: 'chatgpt' },
    });

    const { buildCliArgs } = await import('@main/opencode/electron-options');
    await buildCliArgs({ prompt: 'hello' } as never, 'task-1');

    expect(mockCoreBuildCliArgs).toHaveBeenCalledWith(
      expect.objectContaining({
        selectedModel: {
          provider: 'openai',
          model: 'openai/gpt-5.2',
        },
      }),
    );
    expect(mockStorage.setSelectedModel).toHaveBeenCalledWith({
      provider: 'openai',
      model: 'openai/gpt-5.2',
    });
  });

  it('falls back from OpenAI codex model when a live OAuth session exists even without provider oauth metadata', async () => {
    mockStorage.getSelectedModel.mockReturnValue({
      provider: 'openai',
      model: 'openai/gpt-5.2-codex',
    });
    mockGetOpenAiOauthStatus.mockReturnValue({ connected: true });
    mockStorage.getConnectedProvider.mockReturnValue({
      connectionStatus: 'connected',
      credentials: { type: 'api_key', keyPrefix: 'sk-test...' },
    });

    const { buildCliArgs } = await import('@main/opencode/electron-options');
    await buildCliArgs({ prompt: 'hello' } as never, 'task-1');

    expect(mockCoreBuildCliArgs).toHaveBeenCalledWith(
      expect.objectContaining({
        selectedModel: {
          provider: 'openai',
          model: 'openai/gpt-5.2',
        },
      }),
    );
  });
});
