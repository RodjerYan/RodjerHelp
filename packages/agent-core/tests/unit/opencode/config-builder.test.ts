import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProviderId, ProviderSettings } from '../../../src/common/types/providerSettings.js';

const mockGetOllamaConfig = vi.fn(() => null);
const mockGetLMStudioConfig = vi.fn(() => null);
const mockGetProviderSettings = vi.fn<() => ProviderSettings>();
const mockGetActiveProviderModel = vi.fn(() => null);
const mockGetConnectedProviderIds = vi.fn<() => ProviderId[]>();
const mockGetAzureFoundryConfig = vi.fn(() => null);
const mockGetSelectedModel = vi.fn(() => null);

vi.mock('../../../src/storage/repositories/index.js', () => ({
  getOllamaConfig: mockGetOllamaConfig,
  getLMStudioConfig: mockGetLMStudioConfig,
  getProviderSettings: mockGetProviderSettings,
  getActiveProviderModel: mockGetActiveProviderModel,
  getConnectedProviderIds: mockGetConnectedProviderIds,
  getAzureFoundryConfig: mockGetAzureFoundryConfig,
  getSelectedModel: mockGetSelectedModel,
}));

describe('buildProviderConfigs', () => {
  const baseProviderSettings: ProviderSettings = {
    activeProviderId: null,
    connectedProviders: {},
    debugMode: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetProviderSettings.mockReturnValue(baseProviderSettings);
    mockGetConnectedProviderIds.mockReturnValue([]);
  });

  it('filters unknown connected providers from enabledProviders', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mockGetConnectedProviderIds.mockReturnValue(['openai', 'llamacpp'] as unknown as ProviderId[]);

    const { buildProviderConfigs } = await import('../../../src/opencode/config-builder.js');
    const result = await buildProviderConfigs({
      getApiKey: () => null,
      providerSettings: baseProviderSettings,
    });

    expect(result.enabledProviders).toContain('openai');
    expect(result.enabledProviders).not.toContain('llamacpp');
    expect(result.enabledProviders).not.toContain(undefined as unknown as string);
    expect(result.enabledProviders).not.toContain(null as unknown as string);
    expect(warnSpy).toHaveBeenCalledWith(
      '[OpenCode Config Builder] Ignoring unknown connected providers:',
      ['llamacpp'],
    );
  });
});
